import {
  defineDashboardExtension,
  Page,
  PageLayout,
  PageBlock,
  PageTitle,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  DataTable,
  DetailPageButton,
  api,
} from "@vendure/dashboard";
import { graphql } from "@/gql";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LayersIcon } from "lucide-react";
import { useState, useEffect } from "react";

const channelsQuery = graphql(`
  query GetChannels {
    channels {
      items {
        id
        code
        customFields {
          integrationId
        }
      }
    }
  }
`);

const integrationsQuery = graphql(`
  query GetIntegrationsForChannelProducts {
    integrations {
      items {
        id
      }
    }
  }
`);

const productsQuery = graphql(`
  query GetProductsByChannel($channelId: ID!, $options: ProductListOptions) {
    productsByChannel(channelId: $channelId, options: $options) {
      items {
        id
        name
        slug
        enabled
        variants {
          id
          name
          sku
          price
        }
      }
      totalItems
    }
  }
`);

const addProductToChannelMutation = graphql(`
  mutation AddProductToChannel($productId: ID!, $channelId: ID!) {
    addProductToChannel(productId: $productId, channelId: $channelId) {
      id
      name
    }
  }
`);

const removeProductFromChannelMutation = graphql(`
  mutation RemoveProductFromChannel($productId: ID!, $channelId: ID!) {
    removeProductFromChannel(productId: $productId, channelId: $channelId) {
      id
      name
    }
  }
`);

const updateProductEnabledMutation = graphql(`
  mutation UpdateProductEnabledFromChannelProducts(
    $input: UpdateProductInput!
  ) {
    updateProduct(input: $input) {
      id
      enabled
    }
  }
`);

function ChannelProductsPage() {
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const queryClient = useQueryClient();

  const { data: channelsData, isLoading: channelsLoading } = useQuery({
    queryKey: ["channels"],
    queryFn: async () => {
      const result = await api.query(channelsQuery);
      return result;
    },
  });

  const { data: integrationsData, isLoading: integrationsLoading } = useQuery({
    queryKey: ["integrations-for-channel-products"],
    queryFn: async () => {
      const result = await api.query(integrationsQuery);
      return result;
    },
  });

  const allChannels = (channelsData as any)?.channels?.items || [];
  const integrationIds = new Set(
    ((integrationsData as any)?.integrations?.items || []).map(
      (integration: any) => String(integration.id),
    ),
  );
  const defaultChannel = allChannels.find(
    (ch: any) => ch.code === "__default_channel__",
  );
  const channels = allChannels.filter(
    (ch: any) => ch.code !== "__default_channel__",
  );
  const channelsWithIntegration = channels.filter(
    (ch: any) =>
      ch?.customFields?.integrationId != null &&
      integrationIds.has(String(ch.customFields.integrationId)),
  );
  const [activeTab, setActiveTab] = useState("");

  // Establecer el primer canal con integración como activo cuando se carguen los canales
  useEffect(() => {
    if (channelsWithIntegration.length > 0 && !activeTab) {
      setActiveTab(channelsWithIntegration[0].id);
      return;
    }
    if (
      activeTab &&
      !channelsWithIntegration.some((channel: any) => channel.id === activeTab)
    ) {
      setActiveTab(channelsWithIntegration[0]?.id ?? "");
    }
  }, [channelsWithIntegration, activeTab]);

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ["products", activeTab, page, itemsPerPage],
    queryFn: async () => {
      if (!activeTab) return null;
      const result = await api.query(productsQuery, {
        channelId: activeTab,
        options: {
          skip: (page - 1) * itemsPerPage,
          take: itemsPerPage,
        },
      });
      return result;
    },
    enabled: !!activeTab,
  });

  const products = (productsData as any)?.productsByChannel?.items || [];
  const totalProducts =
    (productsData as any)?.productsByChannel?.totalItems || 0;

  // Query para productos del canal default (columna derecha)
  const { data: defaultProductsData, isLoading: defaultProductsLoading } =
    useQuery({
      queryKey: ["defaultProducts"],
      queryFn: async () => {
        if (!defaultChannel) return null;
        const result = await api.query(productsQuery, {
          channelId: defaultChannel.id,
          options: {
            take: 100, // Mostrar hasta 100 productos
          },
        });
        return result;
      },
      enabled: !!defaultChannel,
    });

  const defaultProducts =
    (defaultProductsData as any)?.productsByChannel?.items || [];
  const totalDefaultProducts =
    (defaultProductsData as any)?.productsByChannel?.totalItems || 0;

  // Filtrar productos del canal default que ya están en el canal activo
  const productIdsInActiveChannel = new Set(products.map((p: any) => p.id));
  const filteredDefaultProducts = defaultProducts.filter(
    (p: any) => !productIdsInActiveChannel.has(p.id),
  );

  // Mutations
  const addProductMutation = useMutation({
    mutationFn: async ({
      productId,
      channelId,
    }: {
      productId: string;
      channelId: string;
    }) => {
      return await api.mutate(addProductToChannelMutation, {
        productId,
        channelId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products", activeTab] });
      queryClient.invalidateQueries({ queryKey: ["defaultProducts"] });
    },
  });

  const removeProductMutation = useMutation({
    mutationFn: async ({
      productId,
      channelId,
    }: {
      productId: string;
      channelId: string;
    }) => {
      return await api.mutate(removeProductFromChannelMutation, {
        productId,
        channelId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products", activeTab] });
      queryClient.invalidateQueries({ queryKey: ["defaultProducts"] });
    },
  });

  const updateEnabledMutation = useMutation({
    mutationFn: async ({
      productId,
      enabled,
    }: {
      productId: string;
      enabled: boolean;
    }) => {
      return await api.mutate(updateProductEnabledMutation, {
        input: {
          id: productId,
          enabled,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["defaultProducts"] });
    },
  });

  const handleAddProduct = (productId: string) => {
    if (activeTab) {
      addProductMutation.mutate({ productId, channelId: activeTab });
    }
  };

  const handleRemoveProduct = (productId: string) => {
    if (activeTab) {
      removeProductMutation.mutate({ productId, channelId: activeTab });
    }
  };

  const handleToggleEnabled = (productId: string, currentEnabled: boolean) => {
    updateEnabledMutation.mutate({
      productId,
      enabled: !currentEnabled,
    });
  };

  const columns = [
    {
      accessorKey: "name",
      header: "Nombre",
      cell: ({ row }: any) => (
        <DetailPageButton
          href={`/products/${row.original.id}`}
          label={row.original.name}
        />
      ),
    },
    {
      accessorKey: "slug",
      header: "Slug",
      cell: ({ row }: any) => (
        <span style={{ fontSize: "0.875rem", color: "#666" }}>
          {row.original.slug}
        </span>
      ),
    },
    {
      accessorKey: "sku",
      header: "SKU",
      cell: ({ row }: any) => row.original.variants?.[0]?.sku || "-",
    },
    {
      accessorKey: "price",
      header: "Precio",
      cell: ({ row }: any) => {
        const price = row.original.variants?.[0]?.price || 0;
        return `$${(price / 100).toFixed(2)}`;
      },
    },
    {
      accessorKey: "toggleEnabled",
      header: "Habilitado",
      cell: ({ row }: any) => {
        const enabled = !!row.original.enabled;
        const isUpdating =
          updateEnabledMutation.isPending &&
          updateEnabledMutation.variables?.productId === row.original.id;
        return (
          <button
            onClick={() => handleToggleEnabled(row.original.id, enabled)}
            disabled={isUpdating}
            style={{
              width: "42px",
              height: "24px",
              border: "none",
              borderRadius: "999px",
              position: "relative",
              background: enabled ? "#16a34a" : "#d1d5db",
              cursor: isUpdating ? "not-allowed" : "pointer",
              opacity: isUpdating ? 0.6 : 1,
              transition: "background 0.2s ease",
            }}
            aria-label={enabled ? "Desactivar producto" : "Activar producto"}
            title={enabled ? "Desactivar producto" : "Activar producto"}
          >
            <span
              style={{
                position: "absolute",
                top: "2px",
                left: enabled ? "20px" : "2px",
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                background: "#fff",
                transition: "left 0.2s ease",
              }}
            />
          </button>
        );
      },
    },
    {
      accessorKey: "actions",
      header: "Acciones",
      cell: ({ row }: any) => (
        <button
          onClick={() => handleRemoveProduct(row.original.id)}
          disabled={removeProductMutation.isPending}
          style={{
            padding: "0.375rem 0.75rem",
            fontSize: "0.875rem",
            fontWeight: 500,
            color: "#fff",
            background: "#dc2626",
            border: "none",
            borderRadius: "6px",
            cursor: removeProductMutation.isPending ? "not-allowed" : "pointer",
            opacity: removeProductMutation.isPending ? 0.6 : 1,
          }}
        >
          {removeProductMutation.isPending ? "Removiendo..." : "Remove"}
        </button>
      ),
    },
  ];

  if (channelsLoading || integrationsLoading) {
    return (
      <Page pageId="channel-products-page">
        <PageLayout>
          <PageTitle>Productos por Canal</PageTitle>
          <PageBlock column="main" blockId="main-stuff">
            <div style={{ padding: "2rem", textAlign: "center" }}>
              Cargando canales e integraciones...
            </div>
          </PageBlock>
        </PageLayout>
      </Page>
    );
  }

  return (
    <Page pageId="channel-products-page">
      <PageLayout>
        <PageTitle>Productos por Canal</PageTitle>

        <PageBlock column="main" blockId="main-stuff">
          {channelsWithIntegration.length === 0 ? (
            <div
              style={{
                padding: "1rem",
                border: "1px solid #fde68a",
                background: "#fffbeb",
                color: "#92400e",
                borderRadius: "8px",
              }}
            >
              No hay canales disponibles para gestionar productos. Asigna una
              integración al canal desde <strong>Canales</strong> para
              habilitarlo aquí.
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                {channelsWithIntegration.map((channel: any) => (
                  <TabsTrigger key={channel.id} value={channel.id}>
                    {channel.code}
                  </TabsTrigger>
                ))}
              </TabsList>

              {channelsWithIntegration.map((channel: any) => (
                <TabsContent key={channel.id} value={channel.id}>
                  <div style={{ marginTop: "1rem" }}>
                    <h3
                      style={{
                        fontSize: "1.125rem",
                        fontWeight: 600,
                        marginBottom: "1rem",
                      }}
                    >
                      Productos en {channel.code}
                    </h3>

                    <DataTable
                      columns={columns}
                      data={products}
                      totalItems={totalProducts}
                      isLoading={productsLoading}
                      page={page}
                      itemsPerPage={itemsPerPage}
                      onPageChange={(table, newPage, newItemsPerPage) => {
                        setPage(newPage);
                        setItemsPerPage(newItemsPerPage);
                      }}
                    />
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </PageBlock>

        <PageBlock column="side" blockId="side-stuff">
          <div style={{ padding: "1rem" }}>
            <h3
              style={{
                fontSize: "1rem",
                fontWeight: 600,
                marginBottom: "0.75rem",
              }}
            >
              Productos Canal Default
            </h3>
            {defaultProductsLoading ? (
              <p style={{ fontSize: "0.875rem", color: "#666" }}>Cargando...</p>
            ) : (
              <>
                <p
                  style={{
                    fontSize: "0.875rem",
                    color: "#666",
                    marginBottom: "1rem",
                  }}
                >
                  Disponibles: {filteredDefaultProducts.length} de{" "}
                  {totalDefaultProducts}
                </p>
                <div style={{ maxHeight: "600px", overflowY: "auto" }}>
                  {filteredDefaultProducts.length === 0 ? (
                    <p
                      style={{
                        fontSize: "0.875rem",
                        color: "#666",
                        fontStyle: "italic",
                      }}
                    >
                      Todos los productos ya están en este canal
                    </p>
                  ) : (
                    filteredDefaultProducts.map((product: any) => (
                      <div
                        key={product.id}
                        style={{
                          padding: "0.75rem",
                          marginBottom: "0.5rem",
                          border: "1px solid #e5e7eb",
                          borderRadius: "6px",
                          fontSize: "0.875rem",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: "0.5rem",
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div
                            style={{ fontWeight: 600, marginBottom: "0.25rem" }}
                          >
                            {product.name}
                          </div>
                          <div style={{ color: "#666", fontSize: "0.75rem" }}>
                            SKU: {product.variants?.[0]?.sku || "-"}
                          </div>
                          <div style={{ color: "#666", fontSize: "0.75rem" }}>
                            $
                            {(
                              (product.variants?.[0]?.price || 0) / 100
                            ).toFixed(2)}
                          </div>
                        </div>
                        <button
                          onClick={() => handleAddProduct(product.id)}
                          disabled={addProductMutation.isPending || !activeTab}
                          style={{
                            padding: "0.375rem 0.75rem",
                            fontSize: "0.75rem",
                            fontWeight: 500,
                            color: "#fff",
                            background: "#16a34a",
                            border: "none",
                            borderRadius: "6px",
                            cursor:
                              addProductMutation.isPending || !activeTab
                                ? "not-allowed"
                                : "pointer",
                            opacity:
                              addProductMutation.isPending || !activeTab
                                ? 0.6
                                : 1,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {addProductMutation.isPending ? "..." : "Add"}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </PageBlock>
      </PageLayout>
    </Page>
  );
}

export default defineDashboardExtension({
  navSections: [
    {
      id: "apps",
      title: "Apps",
      icon: LayersIcon,
      placement: "top",
      order: 5,
    },
  ],
  routes: [
    {
      path: "/channel-products",
      component: () => <ChannelProductsPage />,
      navMenuItem: {
        id: "channel-products",
        sectionId: "apps",
        title: "Productos por Canal",
        icon: LayersIcon,
        order: 15,
      },
    },
  ],
});
