import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ProductIntegrationMapping } from '../entities/product-integration-mapping.entity';
import { WordPressService } from './wordpress.service';
import { IntegrationService } from './integration.service';

@Injectable()
export class ProductMappingService {
    private static readonly loggerCtx = 'ProductMappingService';

    constructor(
        private connection: TransactionalConnection,
        private wordPressService: WordPressService,
        private integrationService: IntegrationService,
    ) {}

    async getMapping(
        ctx: RequestContext,
        vendureProductId: number,
        integrationId: number
    ): Promise<ProductIntegrationMapping | null> {
        return this.connection.getRepository(ctx, ProductIntegrationMapping).findOne({
            where: {
                vendureProductId,
                integrationId,
            },
        });
    }

    async saveMapping(
        ctx: RequestContext,
        vendureProductId: number,
        integrationId: number,
        externalProductId: string,
        externalSku?: string
    ): Promise<ProductIntegrationMapping> {
        const existing = await this.getMapping(ctx, vendureProductId, integrationId);

        if (existing) {
            existing.externalProductId = externalProductId;
            if (externalSku) {
                existing.externalSku = externalSku;
            }
            return this.connection.getRepository(ctx, ProductIntegrationMapping).save(existing);
        }

        const mapping = new ProductIntegrationMapping({
            vendureProductId,
            integrationId,
            externalProductId,
            externalSku: externalSku || '',
        });

        return this.connection.getRepository(ctx, ProductIntegrationMapping).save(mapping);
    }

    async deleteMapping(
        ctx: RequestContext,
        vendureProductId: number,
        integrationId: number
    ): Promise<void> {
        await this.connection.getRepository(ctx, ProductIntegrationMapping).delete({
            vendureProductId,
            integrationId,
        });
    }

    async rebuildMappingsForIntegration(
        ctx: RequestContext,
        integrationId: number
    ): Promise<{ success: number; failed: number; errors: string[] }> {
        const integration = await this.integrationService.findOne(ctx, integrationId);
        
        if (!integration) {
            throw new Error(`Integration ${integrationId} not found`);
        }

        if (integration.type !== 'wordpress') {
            throw new Error(`Rebuild mappings only supported for WordPress integrations`);
        }

        Logger.log(
            `Starting rebuild mappings for integration: ${integration.name}`,
            ProductMappingService.loggerCtx
        );

        const products = await this.connection.getRepository(ctx, 'Product').find({
            relations: ['channels', 'variants'],
        });

        let success = 0;
        let failed = 0;
        const errors: string[] = [];

        for (const product of products) {
            const productChannels = product.channels || [];
            const isInIntegrationChannel = productChannels.some(
                (channel: any) => channel.customFields?.integrationId === integrationId
            );

            if (!isInIntegrationChannel) {
                continue;
            }

            const sku = product.variants?.[0]?.sku;
            if (!sku) {
                failed++;
                errors.push(`Product ${product.id} has no SKU`);
                continue;
            }

            try {
                const result = await this.wordPressService.findProductBySku(integration, sku);
                
                if (result.success && result.data?.id) {
                    await this.saveMapping(
                        ctx,
                        product.id,
                        integrationId,
                        result.data.id.toString(),
                        sku
                    );
                    success++;
                    Logger.debug(
                        `Mapped product ${product.id} (SKU: ${sku}) -> WP ID: ${result.data.id}`,
                        ProductMappingService.loggerCtx
                    );
                } else {
                    failed++;
                    errors.push(`Product ${product.id} (SKU: ${sku}) not found in WordPress`);
                }
            } catch (error) {
                failed++;
                const errorMsg = error instanceof Error ? error.message : String(error);
                errors.push(`Product ${product.id} (SKU: ${sku}): ${errorMsg}`);
            }
        }

        Logger.log(
            `Rebuild complete: ${success} success, ${failed} failed`,
            ProductMappingService.loggerCtx
        );

        return { success, failed, errors };
    }

    async clearMappingsForIntegration(
        ctx: RequestContext,
        integrationId: number
    ): Promise<number> {
        const result = await this.connection.getRepository(ctx, ProductIntegrationMapping).delete({
            integrationId,
        });

        return result.affected || 0;
    }
}
