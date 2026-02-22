import { Injectable } from '@nestjs/common';
import { 
    TransactionalConnection, 
    RequestContext, 
    ID,
    PaginatedList,
    ListQueryBuilder,
    ListQueryOptions,
} from '@vendure/core';
import { Integration, IntegrationType } from '../entities/integration.entity';
import { IntegrationFeatureId } from '../integration-features';

@Injectable()
export class IntegrationService {
    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
    ) {}

    async findAll(
        ctx: RequestContext,
        options?: ListQueryOptions<Integration>,
    ): Promise<PaginatedList<Integration>> {
        return this.listQueryBuilder
            .build(Integration, options)
            .getManyAndCount()
            .then(([items, totalItems]) => ({
                items,
                totalItems,
            }));
    }

    async findOne(ctx: RequestContext, id: ID): Promise<Integration | null> {
        return this.connection.getRepository(ctx, Integration).findOne({
            where: { id },
        });
    }

    async create(
        ctx: RequestContext,
        input: {
            name: string;
            type: IntegrationType;
            config: Record<string, string>;
            enabledFeatures?: IntegrationFeatureId[];
        },
    ): Promise<Integration> {
        const integration = new Integration({
            name: input.name,
            type: input.type,
            config: input.config,
            enabled: true,
            enabledFeatures: input.enabledFeatures || [],
        });
        return this.connection.getRepository(ctx, Integration).save(integration);
    }

    async update(
        ctx: RequestContext,
        id: ID,
        input: {
            name?: string;
            config?: Record<string, string>;
            enabled?: boolean;
            enabledFeatures?: IntegrationFeatureId[];
        },
    ): Promise<Integration | null> {
        const integration = await this.findOne(ctx, id);
        if (!integration) {
            return null;
        }
        if (input.name !== undefined) {
            integration.name = input.name;
        }
        if (input.config !== undefined) {
            integration.config = input.config;
        }
        if (input.enabled !== undefined) {
            integration.enabled = input.enabled;
        }
        if (input.enabledFeatures !== undefined) {
            integration.enabledFeatures = input.enabledFeatures;
        }
        return this.connection.getRepository(ctx, Integration).save(integration);
    }

    async delete(ctx: RequestContext, id: ID): Promise<boolean> {
        const integration = await this.findOne(ctx, id);
        if (!integration) {
            return false;
        }
        await this.connection.getRepository(ctx, Integration).remove(integration);
        return true;
    }
}
