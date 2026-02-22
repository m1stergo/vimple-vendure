# Plugin de Integraciones de Vendure

Plugin que permite sincronizar productos de Vendure con plataformas externas como WordPress/WooCommerce y MercadoLibre.

## Características

- Sincronización automática de productos por canal
- Eventos en tiempo real (create, update, delete)
- Integración con WordPress/WooCommerce
- Integración con MercadoLibre (próximamente)
- Dashboard para gestionar integraciones
- Features activables por integración

## Arquitectura

### Componentes Principales

1. **IntegrationService**: Gestiona las integraciones (CRUD)
2. **ProductEventService**: Escucha eventos de productos y dispara sincronizaciones
3. **WordPressService**: Maneja la comunicación con la API REST de WordPress/WooCommerce
4. **ProductMapperService**: Convierte productos de Vendure al formato de cada plataforma
5. **IntegrationSyncService**: Servicio legacy de sincronización

### Flujo de Sincronización

```
Producto modificado en Vendure
    ↓
ProductEvent disparado
    ↓
ProductEventService escucha el evento
    ↓
Obtiene canales del producto
    ↓
Para cada canal con integración habilitada:
    ↓
    Verifica que la feature "sync_products" esté activa
    ↓
    Convierte el producto al formato de la plataforma
    ↓
    Busca si el producto ya existe (por SKU)
    ↓
    Crea o actualiza el producto en la plataforma externa
```

## Configuración

### 1. Crear una Integración

En el dashboard de Vendure:

1. Ve a **Integraciones**
2. Haz clic en **Nueva Integración**
3. Selecciona el tipo (WordPress o MercadoLibre)
4. Completa los campos de configuración:
   - **WordPress**: URL del sitio, API Key, API Secret
   - **MercadoLibre**: Account Name, Client ID, Client Secret, Access Token
5. Activa las features que desees (ej: "Sincronizar Productos")
6. Guarda la integración

### 2. Vincular Integración a un Canal

1. Ve a **Configuración > Canales**
2. Edita el canal que deseas vincular
3. En el campo **Integration**, selecciona la integración creada
4. Guarda los cambios

### 3. Configurar WordPress (si aplica)

Consulta la guía detallada en WORDPRESS_SETUP.md

## Uso

Una vez configurado, el sistema sincronizará automáticamente:

- **Crear producto**: Se crea en la plataforma externa
- **Actualizar producto**: Se actualiza en la plataforma externa
- **Eliminar producto**: Se elimina de la plataforma externa

### Logs

Los logs de sincronización aparecen en la consola del servidor.

## Desarrollo

### Agregar una Nueva Plataforma

1. Crear servicio de la plataforma en `services/`
2. Implementar métodos: `createProduct`, `updateProduct`, `deleteProduct`
3. Agregar mapper en `ProductMapperService`
4. Actualizar `ProductEventService.syncProductToIntegration`
5. Agregar definición en `integration-features.ts`

### Testing

Para probar la sincronización:

1. Crea una integración y vincúlala a un canal
2. Crea o modifica un producto en ese canal
3. Revisa los logs del servidor para ver el resultado

## Solución de Problemas

### Los productos no se sincronizan

- Verifica que la integración esté habilitada
- Verifica que la feature "sync_products" esté activa
- Verifica que el canal tenga la integración asignada
- Revisa los logs del servidor

### Error de conexión con WordPress

- Verifica las credenciales (API Key y Secret)
- Verifica que la URL sea correcta
- Consulta WORDPRESS_SETUP.md para más detalles
