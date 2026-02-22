# Vendure Dashboard UI Notes

## Fuente de exports
- Archivo base: `node_modules/@vendure/dashboard/src/lib/index.ts`
- Lista plana generada localmente (sesión actual): `/tmp/vendure-dashboard-exports.txt`
- Cantidad detectada: `303` módulos reexportados.

## Componentes clave para modales
- `Dialog`
- `DialogTrigger`
- `DialogContent`
- `DialogHeader`
- `DialogTitle`
- `DialogDescription`
- `DialogFooter`
- `DialogClose`

## Componentes clave para drawer
- `Drawer`
- `DrawerTrigger`
- `DrawerContent`
- `DrawerHeader`
- `DrawerTitle`
- `DrawerDescription`
- `DrawerFooter`
- `DrawerClose`

## Ejemplo: Action bar con Dialog
```tsx
import {
  Button,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  defineDashboardExtension,
} from "@vendure/dashboard";

export default defineDashboardExtension({
  actionBarItems: [
    {
      pageId: "product-list",
      component: () => (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Seleccionar Productos</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Seleccionar Productos</DialogTitle>
              <DialogDescription>Modal de ejemplo</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary">Cerrar</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ),
    },
  ],
});
```

## Ejemplo: Action bar con Drawer
```tsx
import {
  Button,
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
  defineDashboardExtension,
} from "@vendure/dashboard";

export default defineDashboardExtension({
  actionBarItems: [
    {
      pageId: "product-list",
      component: () => (
        <Drawer direction="right">
          <DrawerTrigger asChild>
            <Button variant="outline">Seleccionar Productos</Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Seleccionar Productos</DrawerTitle>
              <DrawerDescription>Drawer de ejemplo</DrawerDescription>
            </DrawerHeader>
            <DrawerFooter>
              <DrawerClose asChild>
                <Button variant="secondary">Cerrar</Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ),
    },
  ],
});
```
