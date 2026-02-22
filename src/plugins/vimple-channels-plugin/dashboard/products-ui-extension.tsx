import {
  api,
  Button,
  Card,
  CardContent,
  DataTableBulkActionItem,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  defineDashboardExtension,
  usePaginatedList,
  useChannel,
} from "@vendure/dashboard";
import { graphql } from "@/gql";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, PowerOff, PowerIcon, Square } from "lucide-react";
import { useState } from "react";

const productsWithChannelStatusQuery = graphql(`
  query GetProductsWithChannelStatusForProductListModal(
    $options: ProductListOptions
  ) {
    productsWithChannelStatus(options: $options) {
      items {
        id
        name
        slug
        enabled
        isAssignedToChannel
      }
      totalItems
    }
  }
`);

const assignProductsMutation = graphql(`
  mutation BulkAssignProductsToChannelFromProductListModal(
    $productIds: [ID!]!
  ) {
    bulkAssignProductsToChannel(productIds: $productIds) {
      id
      name
    }
  }
`);

const removeProductsMutation = graphql(`
  mutation BulkRemoveProductsFromProductListModal($productIds: [ID!]!) {
    bulkRemoveProductsFromChannel(productIds: $productIds) {
      id
      name
    }
  }
`);

const updateProductEnabledMutation = graphql(`
  mutation UpdateProductEnabledFromProductListBulk(
    $input: UpdateProductInput!
  ) {
    updateProduct(input: $input) {
      id
      enabled
    }
  }
`);

function EnableProductsBulkAction({ selection, table }: any) {
  const { refetchPaginatedList } = usePaginatedList();
  const mutation = useMutation({
    mutationFn: async () => {
      await Promise.all(
        selection.map((item: any) =>
          api.mutate(updateProductEnabledMutation, {
            input: { id: item.id, enabled: true },
          }),
        ),
      );
    },
    onSuccess: () => {
      refetchPaginatedList();
      table.resetRowSelection();
    },
  });

  return (
    <DataTableBulkActionItem
      label="Habilitar"
      icon={PowerIcon}
      requiresPermission={["UpdateCatalog"]}
      disabled={mutation.isPending}
      confirmationText={`¿Habilitar ${selection.length} producto(s)?`}
      onClick={() => mutation.mutate()}
    />
  );
}

function DisableProductsBulkAction({ selection, table }: any) {
  const { refetchPaginatedList } = usePaginatedList();
  const mutation = useMutation({
    mutationFn: async () => {
      await Promise.all(
        selection.map((item: any) =>
          api.mutate(updateProductEnabledMutation, {
            input: { id: item.id, enabled: false },
          }),
        ),
      );
    },
    onSuccess: () => {
      refetchPaginatedList();
      table.resetRowSelection();
    },
  });

  return (
    <DataTableBulkActionItem
      label="Deshabilitar"
      icon={PowerOff}
      requiresPermission={["UpdateCatalog"]}
      disabled={mutation.isPending}
      confirmationText={`¿Deshabilitar ${selection.length} producto(s)?`}
      onClick={() => mutation.mutate()}
      className="text-destructive"
    />
  );
}

function SeleccionarProductosModalContent() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(
    new Set(),
  );
  const queryClient = useQueryClient();

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ["products-channel-status", searchTerm],
    queryFn: async () => {
      const result = await api.query(productsWithChannelStatusQuery, {
        options: {
          filter: searchTerm ? { name: { contains: searchTerm } } : undefined,
          take: 100,
        },
      });
      return result;
    },
  });

  const assignMutation = useMutation({
    mutationFn: async (productIds: string[]) => {
      return await api.mutate(assignProductsMutation, {
        productIds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products-channel-status"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setSelectedProducts(new Set());
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (productIds: string[]) => {
      return await api.mutate(removeProductsMutation, {
        productIds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products-channel-status"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setSelectedProducts(new Set());
    },
  });

  const products =
    (productsData as any)?.productsWithChannelStatus?.items || [];
  const totalProducts =
    (productsData as any)?.productsWithChannelStatus?.totalItems || 0;

  const handleToggleProduct = (productId: string) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedProducts.size === products.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(products.map((p: any) => p.id)));
    }
  };

  const handleAssignSelected = () => {
    if (selectedProducts.size > 0) {
      assignMutation.mutate(Array.from(selectedProducts));
    }
  };

  const handleRemoveSelected = () => {
    if (selectedProducts.size > 0) {
      removeMutation.mutate(Array.from(selectedProducts));
    }
  };

  const selectedAssignedCount = Array.from(selectedProducts).filter(
    (id) => products.find((p: any) => p.id === id)?.isAssignedToChannel,
  ).length;

  const selectedUnassignedCount = selectedProducts.size - selectedAssignedCount;

  return (
    <div className="space-y-4">
      <Input
        type="text"
        placeholder="Buscar productos por nombre..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {totalProducts} productos{" "}
          {selectedProducts.size > 0 &&
            `• ${selectedProducts.size} seleccionados`}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleSelectAll}>
            {selectedProducts.size === products.length &&
            products.length > 0 ? (
              <CheckSquare size={16} />
            ) : (
              <Square size={16} />
            )}
            {selectedProducts.size === products.length && products.length > 0
              ? "Deseleccionar"
              : "Seleccionar"}{" "}
            Todos
          </Button>
          {selectedProducts.size > 0 && selectedUnassignedCount > 0 && (
            <Button
              size="sm"
              onClick={handleAssignSelected}
              disabled={assignMutation.isPending}
            >
              {assignMutation.isPending
                ? "Asignando..."
                : `Asignar (${selectedUnassignedCount})`}
            </Button>
          )}
          {selectedProducts.size > 0 && selectedAssignedCount > 0 && (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleRemoveSelected}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending
                ? "Desasignando..."
                : `Desasignar (${selectedAssignedCount})`}
            </Button>
          )}
        </div>
      </div>

      <div className="max-h-[60vh] overflow-auto pr-1">
        {productsLoading ? (
          <p className="text-sm text-muted-foreground">Cargando productos...</p>
        ) : products.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay productos</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            {products.map((product: any) => {
              const isAssigned = product.isAssignedToChannel;
              const isSelected = selectedProducts.has(product.id);
              return (
                <div
                  key={product.id}
                  onClick={() => handleToggleProduct(product.id)}
                  className={`relative cursor-pointer rounded-md border transition-all ${
                    isAssigned ? "ring-2 ring-green-500 bg-green-50" : ""
                  } ${isSelected ? "ring-4 ring-blue-400" : ""}`}
                >
                  <div className="absolute top-3 right-3 z-10">
                    {isSelected ? (
                      <CheckSquare size={18} className="text-blue-600" />
                    ) : (
                      <Square size={18} className="text-gray-400" />
                    )}
                  </div>
                  <Card>
                    <CardContent className="pt-6 pr-10">
                      <div
                        className={`mb-2 font-semibold ${isAssigned ? "text-green-800" : "text-gray-900"}`}
                      >
                        {product.name}
                      </div>
                      <div className="mb-2 text-sm text-gray-600">
                        {product.slug}
                      </div>
                      <div className="flex gap-2">
                        <span
                          className={`rounded px-2 py-1 text-xs font-medium ${
                            product.enabled
                              ? "bg-blue-100 text-blue-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {product.enabled ? "Activo" : "Inactivo"}
                        </span>
                        {isAssigned && (
                          <span className="rounded bg-green-600 px-2 py-1 text-xs font-medium text-white">
                            En Canal
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default defineDashboardExtension({
  dataTables: [
    {
      pageId: "product-list",
      bulkActions: [
        {
          order: 80,
          component: EnableProductsBulkAction,
        },
        {
          order: 90,
          component: DisableProductsBulkAction,
        },
      ],
    },
  ],
  actionBarItems: [
    {
      pageId: "product-list",
      component: () => {
        const { activeChannel } = useChannel();
        if (activeChannel?.code === "__default_channel__") {
          return null;
        }

        return (
          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" variant="outline">
                Seleccionar Productos
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[95vw] max-w-[95vw] sm:!max-w-6xl">
              <DialogHeader>
                <DialogTitle>Seleccionar Productos</DialogTitle>
                <DialogDescription>
                  Gestiona la asignación de productos al canal activo.
                </DialogDescription>
              </DialogHeader>
              <SeleccionarProductosModalContent />
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    Cerrar
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      },
    },
  ],
});
