import { AssetStorageStrategy, Logger } from '@vendure/core';
import { Request } from 'express';
import { Readable } from 'node:stream';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import * as path from 'path';

export interface CustomS3Config {
    bucket: string;
    credentials: {
        accessKeyId: string;
        secretAccessKey: string;
    };
    endpoint?: string;
    region?: string;
    forcePathStyle?: boolean;
    publicUrl?: string;
}

/**
 * Custom S3 Asset Storage Strategy que incluye Content-Type automáticamente
 * basado en la extensión del archivo
 */
export class CustomS3AssetStorageStrategy implements AssetStorageStrategy {
    private s3Client: S3Client;
    public readonly toAbsoluteUrl: (request: Request, identifier: string) => string;

    constructor(
        private config: CustomS3Config,
        toAbsoluteUrl: (request: Request, identifier: string) => string
    ) {
        this.toAbsoluteUrl = toAbsoluteUrl;
        this.s3Client = new S3Client({
            endpoint: config.endpoint,
            region: config.region || 'auto',
            credentials: config.credentials,
            forcePathStyle: config.forcePathStyle !== false,
        });
    }

    async init(): Promise<void> {
        Logger.info(`Inicializando CustomS3AssetStorageStrategy con bucket: ${this.config.bucket}`);
    }

    async writeFileFromBuffer(fileName: string, data: Buffer): Promise<string> {
        return this.writeFile(fileName, data);
    }

    async writeFileFromStream(fileName: string, data: Readable): Promise<string> {
        return this.writeFile(fileName, data);
    }

    private async writeFile(fileName: string, data: Buffer | Readable): Promise<string> {
        const contentType = this.getContentTypeFromFileName(fileName);
        
        const upload = new Upload({
            client: this.s3Client,
            params: {
                Bucket: this.config.bucket,
                Key: fileName,
                Body: data,
                ContentType: contentType,
            },
        });

        const result = await upload.done();
        
        if (!('Key' in result) || !result.Key) {
            throw new Error(`Failed to upload file: ${fileName}`);
        }

        Logger.verbose(`Archivo subido a R2: ${fileName} con Content-Type: ${contentType}`);
        return result.Key;
    }

    async readFileToBuffer(identifier: string): Promise<Buffer> {
        const command = new GetObjectCommand({
            Bucket: this.config.bucket,
            Key: identifier,
        });

        const result = await this.s3Client.send(command);
        
        if (!result.Body) {
            throw new Error(`File not found: ${identifier}`);
        }

        const chunks: Uint8Array[] = [];
        for await (const chunk of result.Body as any) {
            chunks.push(chunk);
        }
        
        return Buffer.concat(chunks);
    }

    async readFileToStream(identifier: string): Promise<Readable> {
        const command = new GetObjectCommand({
            Bucket: this.config.bucket,
            Key: identifier,
        });

        const result = await this.s3Client.send(command);
        
        if (!result.Body) {
            return new Readable({
                read() {
                    this.push(null);
                },
            });
        }

        return result.Body as Readable;
    }

    async deleteFile(identifier: string): Promise<void> {
        const command = new DeleteObjectCommand({
            Bucket: this.config.bucket,
            Key: identifier,
        });

        await this.s3Client.send(command);
    }

    async fileExists(fileName: string): Promise<boolean> {
        try {
            const command = new HeadObjectCommand({
                Bucket: this.config.bucket,
                Key: fileName,
            });

            await this.s3Client.send(command);
            return true;
        } catch (err) {
            return false;
        }
    }

    /**
     * Determina el Content-Type basado en la extensión del archivo
     */
    private getContentTypeFromFileName(fileName: string): string {
        const ext = path.extname(fileName).toLowerCase();
        
        const mimeTypes: Record<string, string> = {
            // Imágenes
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
            '.bmp': 'image/bmp',
            '.ico': 'image/x-icon',
            '.tiff': 'image/tiff',
            '.tif': 'image/tiff',
            
            // Videos
            '.mp4': 'video/mp4',
            '.webm': 'video/webm',
            '.ogv': 'video/ogg',
            '.mov': 'video/quicktime',
            '.avi': 'video/x-msvideo',
            
            // Audio
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.ogg': 'audio/ogg',
            '.oga': 'audio/ogg',
            
            // Documentos
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xls': 'application/vnd.ms-excel',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            
            // Otros
            '.json': 'application/json',
            '.xml': 'application/xml',
            '.zip': 'application/zip',
            '.txt': 'text/plain',
        };

        return mimeTypes[ext] || 'application/octet-stream';
    }
}

/**
 * Factory function para crear la estrategia personalizada
 */
export function configureCustomS3AssetStorage(config: CustomS3Config) {
    return (options: any) => {
        const { assetUrlPrefix } = options;
        const configuredBaseUrl = (config.publicUrl || 'https://vimpleimagecdn.site').replace(/\/+$/, '');

        const toAbsoluteUrl = (_request: Request, identifier: string): string => {
            if (!identifier) {
                return '';
            }
            if (identifier.startsWith('http://') || identifier.startsWith('https://')) {
                return identifier;
            }
            const prefix = assetUrlPrefix || `${configuredBaseUrl}/`;
            return identifier.startsWith(prefix) ? identifier : `${prefix}${identifier}`;
        };

        return new CustomS3AssetStorageStrategy(config, toAbsoluteUrl);
    };
}
