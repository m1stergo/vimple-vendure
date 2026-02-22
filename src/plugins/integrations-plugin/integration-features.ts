/**
 * Define las funcionalidades disponibles para cada tipo de integración.
 * Cada funcionalidad tiene un ID único, nombre, descripción y el evento al que se suscribe.
 */

export type IntegrationFeatureId = 
    | 'sync_products'
    | 'sync_product_questions'
    | 'sync_orders'
    | 'sync_post_sale_messages';

export interface IntegrationFeature {
    id: IntegrationFeatureId;
    name: string;
    description: string;
    icon: string;
}

export interface IntegrationTypeDefinition {
    id: string;
    name: string;
    description: string;
    icon: string;
    features: IntegrationFeature[];
    configFields: { key: string; label: string; type: string; placeholder?: string }[];
}

/**
 * Registro de todos los tipos de integración y sus funcionalidades
 */
export const INTEGRATION_TYPES: Record<string, IntegrationTypeDefinition> = {
    mercadolibre: {
        id: 'mercadolibre',
        name: 'MercadoLibre',
        description: 'Sincroniza tus productos y órdenes con MercadoLibre',
        icon: '🛒',
        features: [
            {
                id: 'sync_products',
                name: 'Sincronizar Productos',
                description: 'Publica y actualiza productos automáticamente en MercadoLibre',
                icon: '📦',
            },
            {
                id: 'sync_product_questions',
                name: 'Sincronizar Preguntas',
                description: 'Recibe y responde preguntas de productos desde Vendure',
                icon: '❓',
            },
            {
                id: 'sync_orders',
                name: 'Sincronizar Órdenes',
                description: 'Importa órdenes de MercadoLibre a Vendure',
                icon: '🛍️',
            },
            {
                id: 'sync_post_sale_messages',
                name: 'Mensajes Post-Venta',
                description: 'Gestiona mensajes de compradores después de la venta',
                icon: '💬',
            },
        ],
        configFields: [
            { key: 'accountName', label: 'Nombre de la cuenta', type: 'text', placeholder: 'Ej: Mi Tienda ML' },
            { key: 'clientId', label: 'Client ID', type: 'text', placeholder: 'Tu Client ID de MercadoLibre' },
            { key: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: 'Tu Client Secret' },
            { key: 'accessToken', label: 'Access Token', type: 'password', placeholder: 'Tu Access Token' },
        ],
    },
    wordpress: {
        id: 'wordpress',
        name: 'WordPress',
        description: 'Conecta tu tienda con WordPress/WooCommerce',
        icon: '📝',
        features: [
            {
                id: 'sync_products',
                name: 'Sincronizar Productos',
                description: 'Publica y actualiza productos en WooCommerce',
                icon: '📦',
            },
        ],
        configFields: [
            { key: 'siteName', label: 'Nombre del sitio', type: 'text', placeholder: 'Ej: Mi Blog WordPress' },
            { key: 'siteUrl', label: 'URL del sitio', type: 'text', placeholder: 'https://tu-sitio.com' },
            { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Tu API Key de WooCommerce' },
            { key: 'apiSecret', label: 'API Secret', type: 'password', placeholder: 'Tu API Secret' },
        ],
    },
};

/**
 * Obtiene las funcionalidades disponibles para un tipo de integración
 */
export function getAvailableFeatures(integrationType: string): IntegrationFeature[] {
    return INTEGRATION_TYPES[integrationType]?.features || [];
}

/**
 * Obtiene la definición completa de un tipo de integración
 */
export function getIntegrationType(integrationType: string): IntegrationTypeDefinition | undefined {
    return INTEGRATION_TYPES[integrationType];
}
