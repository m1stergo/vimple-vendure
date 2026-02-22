import { 
    defineDashboardExtension,
    Page, 
    PageBlock, 
    PageLayout, 
    PageTitle,
    Card,
    Button,
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter,
    Input,
    Label,
    api,
    DashboardFormComponent,
} from '@vendure/dashboard';
import { graphql } from '@/gql';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlugIcon, CheckCircleIcon, PlusCircleIcon, TrashIcon, PowerIcon, PowerOffIcon, Loader2Icon } from 'lucide-react';
import { useState } from 'react';

// ==================== GRAPHQL ====================

const integrationsQuery = graphql(`
    query GetIntegrations {
        integrations {
            items {
                id
                name
                type
                config
                enabled
                enabledFeatures
                createdAt
            }
            totalItems
        }
    }
`);

const createIntegrationMutation = graphql(`
    mutation CreateIntegration($input: CreateIntegrationInput!) {
        createIntegration(input: $input) {
            id
            name
            type
            enabled
        }
    }
`);

const updateIntegrationMutation = graphql(`
    mutation UpdateIntegration($id: ID!, $input: UpdateIntegrationInput!) {
        updateIntegration(id: $id, input: $input) {
            id
            name
            enabled
        }
    }
`);

const deleteIntegrationMutation = graphql(`
    mutation DeleteIntegration($id: ID!) {
        deleteIntegration(id: $id) {
            result
            message
        }
    }
`);

// ==================== TYPES ====================

interface IntegrationTemplate {
    id: string;
    name: string;
    description: string;
    icon: string;
    fields: { key: string; label: string; type: string; placeholder?: string }[];
}

interface Integration {
    id: string;
    name: string;
    type: string;
    config: Record<string, string>;
    enabled: boolean;
    enabledFeatures: string[];
    createdAt: string;
}

interface IntegrationFeature {
    id: string;
    name: string;
    description: string;
    icon: string;
}

interface IntegrationTypeDefinition {
    id: string;
    name: string;
    description: string;
    icon: string;
    features: IntegrationFeature[];
    configFields: { key: string; label: string; type: string; placeholder?: string }[];
}

// ==================== DATA ====================

const INTEGRATION_TYPES: Record<string, IntegrationTypeDefinition> = {
    mercadolibre: {
        id: 'mercadolibre',
        name: 'MercadoLibre',
        description: 'Sincroniza tus productos y órdenes con MercadoLibre',
        icon: '🛒',
        features: [
            { id: 'sync_products', name: 'Sincronizar Productos', description: 'Publica y actualiza productos automáticamente', icon: '📦' },
            { id: 'sync_product_questions', name: 'Sincronizar Preguntas', description: 'Recibe y responde preguntas de productos', icon: '❓' },
            { id: 'sync_orders', name: 'Sincronizar Órdenes', description: 'Importa órdenes de MercadoLibre', icon: '🛍️' },
            { id: 'sync_post_sale_messages', name: 'Mensajes Post-Venta', description: 'Gestiona mensajes de compradores', icon: '💬' },
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
            { id: 'sync_products', name: 'Sincronizar Productos', description: 'Publica y actualiza productos en WooCommerce', icon: '📦' },
        ],
        configFields: [
            { key: 'siteName', label: 'Nombre del sitio', type: 'text', placeholder: 'Ej: Mi Blog WordPress' },
            { key: 'siteUrl', label: 'URL del sitio', type: 'text', placeholder: 'https://tu-sitio.com' },
            { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Tu API Key de WooCommerce' },
            { key: 'apiSecret', label: 'API Secret', type: 'password', placeholder: 'Tu API Secret' },
        ],
    },
};

// ==================== HELPERS ====================

function getTemplateIcon(type: string): string {
    const icons: Record<string, string> = {
        mercadolibre: '🛒',
        wordpress: '📝',
        slack: '💬',
    };
    return icons[type] || '🔌';
}

// ==================== COMPONENTS ====================

function IntegrationCard({ 
    integration, 
    typeDef, 
    onToggle,
    onRemove,
    onConfigure,
    isDeleting,
}: { 
    integration: Integration; 
    typeDef: IntegrationTypeDefinition | undefined;
    onToggle: (id: string, enabled: boolean) => void;
    onRemove: (id: string) => void;
    onConfigure: (integration: Integration) => void;
    isDeleting: boolean;
}) {
    const icon = typeDef?.icon || getTemplateIcon(integration.type);
    const description = typeDef?.description || `Integración tipo ${integration.type}`;
    const enabledFeaturesCount = integration.enabledFeatures?.length || 0;
    const totalFeatures = typeDef?.features?.length || 0;
    
    return (
        <Card className="p-4 flex items-start gap-4">
            <div className="text-4xl">{icon}</div>
            <div className="flex-1">
                <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg">{integration.name}</h3>
                    {integration.enabled ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                            <CheckCircleIcon className="w-3 h-3" />
                            Activa
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                            <PowerOffIcon className="w-3 h-3" />
                            Inactiva
                        </span>
                    )}
                </div>
                <p className="text-muted-foreground text-sm mt-1">{description}</p>
                {totalFeatures > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                        {enabledFeaturesCount} de {totalFeatures} funcionalidades activas
                    </p>
                )}
                <div className="mt-3 flex gap-2 flex-wrap">
                    <Button 
                        variant="outline"
                        size="sm"
                        onClick={() => onConfigure(integration)}
                    >
                        Configurar
                    </Button>
                    <Button 
                        variant="outline"
                        size="sm"
                        onClick={() => onToggle(integration.id, !integration.enabled)}
                    >
                        {integration.enabled ? (
                            <>
                                <PowerOffIcon className="w-4 h-4 mr-1" />
                                Desactivar
                            </>
                        ) : (
                            <>
                                <PowerIcon className="w-4 h-4 mr-1" />
                                Activar
                            </>
                        )}
                    </Button>
                    <Button 
                        variant="outline"
                        size="sm"
                        onClick={() => onRemove(integration.id)}
                        disabled={isDeleting}
                    >
                        {isDeleting ? (
                            <Loader2Icon className="w-4 h-4 animate-spin" />
                        ) : (
                            <>
                                <TrashIcon className="w-4 h-4 mr-1" />
                                Eliminar
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </Card>
    );
}

// ==================== PAGE ====================

function IntegrationsPage() {
    const queryClient = useQueryClient();
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [selectedType, setSelectedType] = useState<IntegrationTypeDefinition | null>(null);
    const [editingIntegration, setEditingIntegration] = useState<Integration | null>(null);
    const [formData, setFormData] = useState<Record<string, string>>({});
    const [enabledFeatures, setEnabledFeatures] = useState<string[]>([]);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Fetch integrations
    const { data, isLoading } = useQuery({
        queryKey: ['integrations'],
        queryFn: () => api.query(integrationsQuery),
    });

    const integrations: Integration[] = (data as any)?.integrations?.items || [];

    // Create mutation
    const createMutation = useMutation({
        mutationFn: (input: { name: string; type: string; config: string; enabledFeatures: string[] }) => 
            api.mutate(createIntegrationMutation, { input }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['integrations'] });
            handleCloseDrawer();
        },
    });

    // Update mutation
    const updateMutation = useMutation({
        mutationFn: ({ id, input }: { id: string; input: { enabled?: boolean; enabledFeatures?: string[] } }) => 
            api.mutate(updateIntegrationMutation, { id, input }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['integrations'] });
            handleCloseDrawer();
        },
    });

    // Delete mutation
    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.mutate(deleteIntegrationMutation, { id }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['integrations'] });
            setDeletingId(null);
        },
        onError: (error) => {
            console.error('Error deleting integration:', error);
            setDeletingId(null);
        },
    });

    const handleInstallClick = (typeDef: IntegrationTypeDefinition) => {
        setSelectedType(typeDef);
        setEditingIntegration(null);
        setFormData({});
        setEnabledFeatures(typeDef.features.map(f => f.id)); // All features enabled by default
        setIsDrawerOpen(true);
    };

    const handleConfigureClick = (integration: Integration) => {
        const typeDef = INTEGRATION_TYPES[integration.type];
        setSelectedType(typeDef || null);
        setEditingIntegration(integration);
        setFormData(integration.config || {});
        setEnabledFeatures(integration.enabledFeatures || []);
        setIsDrawerOpen(true);
    };

    const handleConfirmInstall = () => {
        if (!selectedType) return;
        
        const name = formData.accountName || formData.siteName || formData.workspaceName || formData.phoneNumber || selectedType.name;
        
        if (editingIntegration) {
            // Update existing integration
            updateMutation.mutate({
                id: editingIntegration.id,
                input: { 
                    config: JSON.stringify(formData),
                    enabledFeatures 
                },
            });
        } else {
            // Create new integration
            createMutation.mutate({
                name,
                type: selectedType.id,
                config: JSON.stringify(formData),
                enabledFeatures,
            });
        }
    };

    const handleToggle = (id: string, enabled: boolean) => {
        updateMutation.mutate({ id, input: { enabled } });
    };

    const handleRemove = (id: string) => {
        setDeletingId(id);
        deleteMutation.mutate(id);
    };

    const handleCloseDrawer = () => {
        setIsDrawerOpen(false);
        setSelectedType(null);
        setEditingIntegration(null);
        setFormData({});
        setEnabledFeatures([]);
    };

    const toggleFeature = (featureId: string) => {
        setEnabledFeatures(prev => 
            prev.includes(featureId) 
                ? prev.filter(f => f !== featureId)
                : [...prev, featureId]
        );
    };

    return (
        <Page pageId="integrations">
            <PageTitle>Integraciones</PageTitle>
            <PageLayout>
                <PageBlock 
                    column="main" 
                    blockId="integrations-installed"
                    title="Integraciones Instaladas"
                    description={`${integrations.length} integración${integrations.length !== 1 ? 'es' : ''}`}
                >
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2Icon className="w-8 h-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : integrations.length > 0 ? (
                        <div className="grid gap-4 md:grid-cols-2">
                            {integrations.map(integration => {
                                const typeDef = INTEGRATION_TYPES[integration.type];
                                return (
                                    <IntegrationCard 
                                        key={integration.id} 
                                        integration={integration}
                                        typeDef={typeDef}
                                        onToggle={handleToggle}
                                        onRemove={handleRemove}
                                        onConfigure={handleConfigureClick}
                                        isDeleting={deletingId === integration.id}
                                    />
                                );
                            })}
                        </div>
                    ) : (
                        <Card className="p-12">
                            <div className="text-center">
                                <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
                                    <PlugIcon className="w-8 h-8 text-muted-foreground/50" />
                                </div>
                                <h3 className="text-lg font-semibold mb-2">Sin integraciones instaladas</h3>
                                <p className="text-muted-foreground text-sm">
                                    Selecciona una integración del panel derecho para comenzar a sincronizar tus canales de venta.
                                </p>
                            </div>
                        </Card>
                    )}
                </PageBlock>

                <PageBlock 
                    column="side" 
                    blockId="integrations-available"
                    title="Disponibles"
                    description="Haz clic para instalar"
                >
                    <div className="space-y-3">
                        {Object.values(INTEGRATION_TYPES).map(typeDef => (
                            <button
                                key={typeDef.id}
                                onClick={() => handleInstallClick(typeDef)}
                                className="w-full flex items-center gap-3 p-3 bg-muted/50 hover:bg-muted rounded-lg transition-colors text-left"
                            >
                                <span className="text-2xl">{typeDef.icon}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium">{typeDef.name}</div>
                                    <div className="text-xs text-muted-foreground truncate">{typeDef.description}</div>
                                </div>
                                <PlusCircleIcon className="w-5 h-5 text-primary flex-shrink-0" />
                            </button>
                        ))}
                    </div>
                </PageBlock>
            </PageLayout>

            <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
                <SheetContent className="overflow-y-auto">
                    <SheetHeader>
                        <SheetTitle className="flex items-center gap-2">
                            {selectedType && (
                                <>
                                    <span className="text-2xl">{selectedType.icon}</span>
                                    {editingIntegration ? `Configurar ${editingIntegration.name}` : `Instalar ${selectedType.name}`}
                                </>
                            )}
                        </SheetTitle>
                        <SheetDescription>
                            {editingIntegration 
                                ? 'Actualiza las credenciales y funcionalidades activas para esta integración.'
                                : 'Configura los datos de conexión para esta integración.'
                            }
                        </SheetDescription>
                    </SheetHeader>
                    
                    <div className="py-6 space-y-6">
                        {/* Config fields - show always */}
                        {selectedType?.configFields.map(field => (
                            <div key={field.key} className="space-y-2">
                                <Label htmlFor={field.key}>{field.label}</Label>
                                <Input
                                    id={field.key}
                                    type={field.type}
                                    placeholder={field.placeholder}
                                    value={formData[field.key] || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                                />
                            </div>
                        ))}

                        {/* Feature toggles */}
                        {selectedType && selectedType.features.length > 0 && (
                            <div className="space-y-3">
                                <Label className="text-base font-semibold">Funcionalidades</Label>
                                <p className="text-sm text-muted-foreground">
                                    Selecciona qué funcionalidades quieres activar para esta integración.
                                </p>
                                <div className="space-y-2 mt-3">
                                    {selectedType.features.map(feature => (
                                        <label
                                            key={feature.id}
                                            className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={enabledFeatures.includes(feature.id)}
                                                onChange={() => toggleFeature(feature.id)}
                                                className="mt-1 w-4 h-4 rounded border-gray-300"
                                            />
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span>{feature.icon}</span>
                                                    <span className="font-medium">{feature.name}</span>
                                                </div>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {feature.description}
                                                </p>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <SheetFooter>
                        <Button variant="outline" onClick={handleCloseDrawer}>
                            Cancelar
                        </Button>
                        <Button 
                            onClick={handleConfirmInstall} 
                            disabled={createMutation.isPending || updateMutation.isPending}
                        >
                            {(createMutation.isPending || updateMutation.isPending) ? (
                                <Loader2Icon className="w-4 h-4 mr-1 animate-spin" />
                            ) : (
                                <CheckCircleIcon className="w-4 h-4 mr-1" />
                            )}
                            {editingIntegration ? 'Guardar Cambios' : 'Confirmar Instalación'}
                        </Button>
                    </SheetFooter>
                </SheetContent>
            </Sheet>
        </Page>
    );
}

// ==================== INTEGRATION SELECTOR FOR CHANNEL ====================

const IntegrationSelectorComponent: DashboardFormComponent = ({ value, onChange }) => {
    const { data, isLoading } = useQuery({
        queryKey: ['integrations-for-selector'],
        queryFn: () => api.query(integrationsQuery),
    });

    const integrations: Integration[] = (data as any)?.integrations?.items || [];
    const enabledIntegrations = integrations.filter(i => i.enabled);

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2Icon className="w-4 h-4 animate-spin" />
                Cargando integraciones...
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <select
                value={value ?? ''}
                onChange={(e) => onChange(e.target.value ? parseInt(e.target.value, 10) : null)}
                className="w-full px-3 py-2 border rounded-md bg-background"
            >
                <option value="">Sin integración</option>
                {enabledIntegrations.map(integration => (
                    <option key={integration.id} value={integration.id}>
                        {getTemplateIcon(integration.type)} {integration.name}
                    </option>
                ))}
            </select>
            {enabledIntegrations.length === 0 && (
                <p className="text-xs text-muted-foreground">
                    No hay integraciones activas. <a href="/dashboard/integrations" className="text-primary underline">Crear una integración</a>
                </p>
            )}
            {value && (
                <p className="text-xs text-muted-foreground">
                    Los cambios en productos de este canal se sincronizarán automáticamente con la integración seleccionada.
                </p>
            )}
        </div>
    );
};

// ==================== DASHBOARD EXTENSION ====================

export default defineDashboardExtension({
    routes: [
        {
            path: '/integrations',
            component: () => <IntegrationsPage />,
            navMenuItem: {
                id: 'integrations',
                sectionId: 'settings',
                title: 'Integraciones',
                order: 25,
            },
        },
    ],
    customFormComponents: {
        customFields: [
            {
                id: 'integration-selector',
                component: IntegrationSelectorComponent,
            },
        ],
    },
});
