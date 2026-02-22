import { LanguageCode, PluginCommonModule, VendurePlugin } from '@vendure/core';
import { Integration } from './entities/integration.entity';
import { ProductIntegrationMapping } from './entities/product-integration-mapping.entity';
import { IntegrationService } from './services/integration.service';
import { ProductEventService } from './services/product-event.service';
import { WordPressService } from './services/wordpress.service';
import { ProductMapperService } from './services/product-mapper.service';
import { ProductMappingService } from './services/product-mapping.service';
import { IntegrationAdminResolver } from './api/integration.resolver';
import { adminApiExtensions } from './api/api-extensions';

@VendurePlugin({
    imports: [PluginCommonModule],
    compatibility: '^3.0.0',
    entities: [Integration, ProductIntegrationMapping],
    providers: [
        IntegrationService, 
        ProductEventService,
        WordPressService,
        ProductMapperService,
        ProductMappingService,
    ],
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [IntegrationAdminResolver],
    },
    configuration: (config) => {
        config.customFields.Channel.push({
            name: 'integrationId',
            type: 'int',
            nullable: true,
            label: [{ languageCode: LanguageCode.en, value: 'Integration' }],
            description: [{ languageCode: LanguageCode.en, value: 'Link this channel to an integration for automatic product sync' }],
            ui: {
                component: 'integration-selector',
            },
        });
        return config;
    },
    dashboard: './dashboard/index.tsx',
})
export class IntegrationsPlugin {}
