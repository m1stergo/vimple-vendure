import { Injectable, OnModuleInit } from "@nestjs/common";
import {
  Channel,
  EventBus,
  Job,
  JobQueue,
  JobQueueService,
  LanguageCode,
  Logger,
  ProductEvent,
  ProductChannelEvent,
  ProductVariantEvent,
  ProductVariantService,
  RequestContext,
  RequestContextService,
  TransactionalConnection,
} from "@vendure/core";
import { filter } from "rxjs/operators";
import { Integration } from "../entities/integration.entity";
import { IntegrationService } from "./integration.service";
import { ProductMapperService } from "./product-mapper.service";
import { ProductMappingService } from "./product-mapping.service";
import { WordPressService } from "./wordpress.service";

type SyncEventType = "created" | "updated" | "deleted";

interface ProductSyncJobData {
  eventType: SyncEventType;
  productId: number;
  channelId: number;
  integrationId: number;
  languageCode: LanguageCode;
}

@Injectable()
export class ProductEventService implements OnModuleInit {
  private static readonly loggerCtx = "ProductEventService";
  private syncQueue!: JobQueue<ProductSyncJobData>;

  constructor(
    private eventBus: EventBus,
    private connection: TransactionalConnection,
    private integrationService: IntegrationService,
    private wordPressService: WordPressService,
    private productMapper: ProductMapperService,
    private productMappingService: ProductMappingService,
    private productVariantService: ProductVariantService,
    private jobQueueService: JobQueueService,
    private requestContextService: RequestContextService,
  ) {}

  async onModuleInit() {
    this.syncQueue = await this.jobQueueService.createQueue({
      name: "integration-product-sync",
      process: async (job) => this.processSyncJob(job),
    });
    this.subscribeToProductEvents();
  }

  private subscribeToProductEvents() {
    this.eventBus
      .ofType(ProductEvent)
      .pipe(
        filter(
          (event) =>
            event.type === "created" ||
            event.type === "updated" ||
            event.type === "deleted",
        ),
      )
      .subscribe(async (event) => {
        await this.handleProductEvent(event);
      });

    this.eventBus
      .ofType(ProductVariantEvent)
      .pipe(
        filter(
          (event) =>
            event.type === "created" ||
            event.type === "updated" ||
            event.type === "deleted",
        ),
      )
      .subscribe(async (event) => {
        await this.handleProductVariantEvent(event);
      });

    this.eventBus
      .ofType(ProductChannelEvent)
      .pipe(filter((event) => event.type === "assigned"))
      .subscribe(async (event) => {
        await this.handleProductChannelEvent(event);
      });

    Logger.info(
      "Subscribed to Product and ProductVariant events",
      ProductEventService.loggerCtx,
    );
  }

  private async handleProductEvent(event: ProductEvent) {
    const { ctx, type, product } = event;

    try {
      const productChannelIds = await this.getProductChannelIds(
        ctx,
        product.id,
      );
      for (const channelId of productChannelIds) {
        await this.enqueueSyncForChannel(
          ctx,
          type as SyncEventType,
          Number(product.id),
          channelId,
        );
      }
    } catch (error) {
      Logger.error(
        `Error handling product event: ${error instanceof Error ? error.message : String(error)}`,
        ProductEventService.loggerCtx,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async handleProductVariantEvent(event: ProductVariantEvent) {
    const { ctx, variants } = event;

    try {
      for (const variant of variants) {
        const productId = await this.getProductIdFromVariant(ctx, variant.id);
        if (!productId) {
          Logger.warn(
            `Product for variant ${variant.id} not found`,
            ProductEventService.loggerCtx,
          );
          continue;
        }

        const productChannelIds = await this.getProductChannelIds(
          ctx,
          productId,
        );
        for (const channelId of productChannelIds) {
          await this.enqueueSyncForChannel(
            ctx,
            "updated",
            productId,
            channelId,
          );
        }
      }
    } catch (error) {
      Logger.error(
        `Error handling variant event: ${error instanceof Error ? error.message : String(error)}`,
        ProductEventService.loggerCtx,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async handleProductChannelEvent(event: ProductChannelEvent) {
    const { ctx, product, channelId } = event;

    try {
      await this.enqueueSyncForChannel(
        ctx,
        "created",
        Number(product.id),
        Number(channelId),
      );
    } catch (error) {
      Logger.error(
        `Error handling product channel assignment event: ${error instanceof Error ? error.message : String(error)}`,
        ProductEventService.loggerCtx,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async enqueueSyncForChannel(
    ctx: RequestContext,
    eventType: SyncEventType,
    productId: number,
    channelId: number,
  ): Promise<void> {
    const integration = await this.getIntegrationForChannel(ctx, channelId);

    if (!integration || !integration.enabled) {
      return;
    }

    const enabledFeatures = Array.isArray(integration.enabledFeatures)
      ? integration.enabledFeatures
      : [];
    const hasProductSyncFeature =
      enabledFeatures.length === 0 || enabledFeatures.includes("sync_products");

    if (!hasProductSyncFeature) {
      Logger.debug(
        `Skipping enqueue for integration ${integration.name} - sync_products not enabled`,
        ProductEventService.loggerCtx,
      );
      return;
    }

    await this.syncQueue.add(
      {
        eventType,
        productId,
        channelId,
        integrationId: Number(integration.id),
        languageCode: ctx.languageCode,
      },
      { retries: 3 },
    );

    Logger.info(
      `[QUEUE] Enqueued product sync event=${eventType} productId=${productId} channelId=${channelId} integrationId=${integration.id}`,
      ProductEventService.loggerCtx,
    );
  }

  private async processSyncJob(job: Job<ProductSyncJobData>) {
    const { eventType, productId, channelId, integrationId, languageCode } =
      job.data;

    const channel = await this.connection.rawConnection
      .getRepository(Channel)
      .findOne({
        where: { id: channelId },
      });

    if (!channel) {
      Logger.warn(
        `[QUEUE] Channel ${channelId} not found`,
        ProductEventService.loggerCtx,
      );
      return;
    }

    const channelCtx = await this.requestContextService.create({
      apiType: "admin",
      channelOrToken: channel.token,
      languageCode,
    });

    const integration = await this.integrationService.findOne(
      channelCtx,
      integrationId,
    );
    if (!integration || !integration.enabled) {
      Logger.warn(
        `[QUEUE] Integration ${integrationId} unavailable for channel ${channelId}`,
        ProductEventService.loggerCtx,
      );
      return;
    }

    if (eventType === "deleted") {
      await this.syncDeletedProductToWordPress(
        channelCtx,
        productId,
        integration,
      );
      return;
    }

    const fullProduct = await this.getFullProductForChannel(
      channelCtx,
      productId,
    );
    if (!fullProduct) {
      Logger.warn(
        `[QUEUE] Product ${productId} not found`,
        ProductEventService.loggerCtx,
      );
      return;
    }

    const isInChannel = (fullProduct.channels || []).some(
      (ch: any) => Number(ch.id) === channelId,
    );
    if (!isInChannel) {
      Logger.info(
        `[QUEUE] Product ${productId} no longer belongs to channel ${channelId}; skipping ${eventType}`,
        ProductEventService.loggerCtx,
      );
      return;
    }

    if (integration.type === "wordpress") {
      await this.syncToWordPress(
        channelCtx,
        eventType,
        fullProduct,
        integration,
      );
    } else if (integration.type === "mercadolibre") {
      Logger.debug(
        `MercadoLibre sync not yet implemented for product ${productId}`,
        ProductEventService.loggerCtx,
      );
    }
  }

  private async syncDeletedProductToWordPress(
    ctx: RequestContext,
    productId: number,
    integration: Integration,
  ) {
    const mapping = await this.productMappingService.getMapping(
      ctx,
      productId,
      Number(integration.id),
    );
    const wordpressProductId = mapping
      ? parseInt(mapping.externalProductId)
      : null;

    if (!wordpressProductId) {
      Logger.info(
        `[DELETE] No mapping found for vendureProductId=${productId} integrationId=${integration.id}. Skipping WordPress delete.`,
        ProductEventService.loggerCtx,
      );
      return;
    }

    const result = await this.wordPressService.deleteProduct(
      integration,
      wordpressProductId,
    );

    if (!result.success) {
      Logger.error(
        `[DELETE] Failed to delete WordPress product wpId=${wordpressProductId} vendureProductId=${productId}: ${result.error}`,
        ProductEventService.loggerCtx,
      );
      return;
    }

    await this.productMappingService.deleteMapping(
      ctx,
      productId,
      Number(integration.id),
    );

    Logger.info(
      `[DELETE] Deleted WordPress product wpId=${wordpressProductId} for vendureProductId=${productId}`,
      ProductEventService.loggerCtx,
    );
  }

  private async getProductChannelIds(
    ctx: RequestContext,
    productId: number | string,
  ): Promise<number[]> {
    const product = await this.connection
      .getRepository(ctx, "Product")
      .findOne({
        where: { id: Number(productId) },
        withDeleted: true,
        relations: ["channels"],
      });

    return (product?.channels || []).map((channel: any) => Number(channel.id));
  }

  private async getProductIdFromVariant(
    ctx: RequestContext,
    variantId: number | string,
  ): Promise<number | null> {
    const variant = await this.connection
      .getRepository(ctx, "ProductVariant")
      .findOne({
        where: { id: Number(variantId) },
        relations: ["product"],
      });

    if (!variant?.product) {
      return null;
    }

    return Number(variant.product.id);
  }

  private async getIntegrationForChannel(
    ctx: RequestContext,
    channelId: number,
  ) {
    const channel = await this.connection
      .getRepository(ctx, "Channel")
      .findOne({
        where: { id: channelId },
      });

    if (!channel?.customFields?.integrationId) {
      return null;
    }

    return this.integrationService.findOne(
      ctx,
      channel.customFields.integrationId,
    );
  }

  private async getFullProductForChannel(
    ctx: RequestContext,
    productId: number | string,
  ) {
    const product = await this.connection
      .getRepository(ctx, "Product")
      .findOne({
        where: { id: Number(productId) },
        relations: [
          "channels",
          "translations",
          "featuredAsset",
          "facetValues",
          "facetValues.facet",
          "variants",
          "variants.options",
          "variants.options.group",
          "variants.options.translations",
          "variants.options.group.translations",
          "variants.translations",
          "variants.featuredAsset",
          "variants.assets",
          "variants.facetValues",
          "variants.facetValues.facet",
          "variants.stockLevels",
          "variants.productVariantPrices",
          "variants.taxCategory",
          "assets",
        ],
      });

    if (product?.variants) {
      for (const variant of product.variants) {
        (variant as any).__syncChannelId = Number(ctx.channelId);
        try {
          await this.productVariantService.applyChannelPriceAndTax(
            variant,
            ctx,
          );
        } catch (error) {
          Logger.error(
            `Failed to apply price for variant ${variant.id}: ${error instanceof Error ? error.message : String(error)}`,
            ProductEventService.loggerCtx,
          );
        }
      }
    }

    return product;
  }

  private async syncToWordPress(
    ctx: RequestContext,
    eventType: SyncEventType,
    product: any,
    integration: Integration,
  ) {
    try {
      const mappedProduct = this.productMapper.vendureToWordPress(product);
      const {
        product: baseWordPressProduct,
        variations,
        facetValues,
      } = mappedProduct;
      const wordPressProduct = { ...baseWordPressProduct };
      const productName =
        product.translations?.[0]?.name ||
        product.name ||
        `Product ${product.id}`;
      const desiredWordPressStatus: "publish" | "draft" = product.enabled
        ? "publish"
        : "draft";
      wordPressProduct.status = desiredWordPressStatus;
      const lookupSku =
        wordPressProduct.sku ||
        variations?.[0]?.sku ||
        `vendure-product-${product.id}`;

      if (facetValues.length > 0) {
        const taxonomyResult =
          await this.wordPressService.mapFacetValuesToTaxonomies(
            integration,
            facetValues,
          );

        if (taxonomyResult.success && taxonomyResult.data) {
          if (taxonomyResult.data.categories.length > 0) {
            wordPressProduct.categories = taxonomyResult.data.categories;
          }
          if (taxonomyResult.data.tags.length > 0) {
            wordPressProduct.tags = taxonomyResult.data.tags;
          }
        } else {
          Logger.warn(
            `Could not map facet values for ${productName}: ${taxonomyResult.error}`,
            ProductEventService.loggerCtx,
          );
        }
      }

      const mapping = await this.productMappingService.getMapping(
        ctx,
        product.id,
        Number(integration.id),
      );
      let wordpressProductId: number | null = mapping
        ? parseInt(mapping.externalProductId)
        : null;

      if (!wordpressProductId) {
        const existingProductResult =
          await this.wordPressService.findProductBySku(integration, lookupSku);
        if (existingProductResult.success && existingProductResult.data?.id) {
          wordpressProductId = existingProductResult.data.id;
          await this.productMappingService.saveMapping(
            ctx,
            product.id,
            Number(integration.id),
            wordpressProductId.toString(),
            lookupSku,
          );
        }
      }

      if (eventType === "deleted") {
        if (wordpressProductId) {
          const result = await this.wordPressService.deleteProduct(
            integration,
            wordpressProductId,
          );
          if (result.success) {
            await this.productMappingService.deleteMapping(
              ctx,
              product.id,
              Number(integration.id),
            );
          } else {
            Logger.error(
              `Failed to delete product from WordPress: ${result.error}`,
              ProductEventService.loggerCtx,
            );
          }
        }
        return;
      }

      if (wordpressProductId) {
        const existingProductResult = await this.wordPressService.getProduct(
          integration,
          wordpressProductId,
        );

        if (existingProductResult.success && existingProductResult.data) {
          const existingType = existingProductResult.data.type;
          const desiredType = wordPressProduct.type;
          const existingStatus = existingProductResult.data.status;
          if (existingStatus !== desiredWordPressStatus) {
            Logger.info(
              `WordPress status will be updated for product ${productName}: existing=${existingStatus} desired=${desiredWordPressStatus}`,
              ProductEventService.loggerCtx,
            );
          }
          if (existingType !== desiredType) {
            Logger.info(
              `WordPress type mismatch for product ${productName}: existing=${existingType} desired=${desiredType}. Recreating product.`,
              ProductEventService.loggerCtx,
            );

            const deleteResult = await this.wordPressService.deleteProduct(
              integration,
              wordpressProductId,
            );
            if (!deleteResult.success) {
              Logger.error(
                `Failed to recreate product ${productName}; delete step failed: ${deleteResult.error}`,
                ProductEventService.loggerCtx,
              );
              return;
            }

            await this.productMappingService.deleteMapping(
              ctx,
              product.id,
              Number(integration.id),
            );
            wordpressProductId = null;
          }
        }
      }

      if (wordpressProductId) {
        const result = await this.wordPressService.updateProduct(
          integration,
          wordpressProductId,
          wordPressProduct,
        );

        if (!result.success) {
          Logger.error(
            `Failed to update product in WordPress: ${result.error}`,
            ProductEventService.loggerCtx,
          );
          return;
        }

        if (variations && variations.length > 0) {
          await this.syncVariationsToWordPress(
            integration,
            wordpressProductId,
            variations,
            productName,
          );
        }
        return;
      }

      const createResult = await this.wordPressService.createProduct(
        integration,
        wordPressProduct,
      );

      if (!(createResult.success && createResult.data?.id)) {
        Logger.error(
          `Failed to create product in WordPress: ${createResult.error}`,
          ProductEventService.loggerCtx,
        );
        return;
      }

      await this.productMappingService.saveMapping(
        ctx,
        product.id,
        Number(integration.id),
        createResult.data.id.toString(),
        lookupSku,
      );

      if (variations && variations.length > 0) {
        await this.syncVariationsToWordPress(
          integration,
          createResult.data.id,
          variations,
          productName,
        );
      }
    } catch (error) {
      Logger.error(
        `Error syncing product to WordPress: ${error instanceof Error ? error.message : String(error)}`,
        ProductEventService.loggerCtx,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async syncVariationsToWordPress(
    integration: Integration,
    wordpressProductId: number,
    variations: any[],
    productName: string,
  ) {
    try {
      Logger.info(
        `[VARIATIONS] Start sync product="${productName}" wpProductId=${wordpressProductId} variations=${variations.length}`,
        ProductEventService.loggerCtx,
      );

      const existingVariationsResult =
        await this.wordPressService.getProductVariations(
          integration,
          wordpressProductId,
        );

      const existingVariations =
        existingVariationsResult.success && existingVariationsResult.data
          ? existingVariationsResult.data
          : [];

      Logger.info(
        `[VARIATIONS] Existing variations in WP for wpProductId=${wordpressProductId}: ${existingVariations.length}`,
        ProductEventService.loggerCtx,
      );

      for (const variation of variations) {
        const vendureVariantId = variation.meta_data?.find(
          (m: any) => m.key === "_vendure_variant_id",
        )?.value;
        Logger.info(
          `[VARIATIONS] Processing sku=${variation.sku} vendureVariantId=${vendureVariantId ?? "n/a"} hasImage=${variation.image ? "yes" : "no"} attributes=${variation.attributes?.length ?? 0}`,
          ProductEventService.loggerCtx,
        );

        const existingVariation = existingVariations.find((ev: any) =>
          ev.meta_data?.find(
            (m: any) =>
              m.key === "_vendure_variant_id" && m.value === vendureVariantId,
          ),
        );

        if (existingVariation && existingVariation.id) {
          Logger.info(
            `[VARIATIONS] Updating existing variation wpVariationId=${existingVariation.id} sku=${variation.sku}`,
            ProductEventService.loggerCtx,
          );
          const updateResult =
            await this.wordPressService.updateProductVariation(
              integration,
              wordpressProductId,
              existingVariation.id,
              variation,
            );

          if (!updateResult.success) {
            Logger.error(
              `Failed to update variation ${variation.sku}: ${updateResult.error}`,
              ProductEventService.loggerCtx,
            );
          } else {
            Logger.info(
              `[VARIATIONS] Updated variation sku=${variation.sku} wpVariationId=${existingVariation.id}`,
              ProductEventService.loggerCtx,
            );
          }
        } else {
          Logger.info(
            `[VARIATIONS] Creating new variation sku=${variation.sku}`,
            ProductEventService.loggerCtx,
          );
          const createResult =
            await this.wordPressService.createProductVariation(
              integration,
              wordpressProductId,
              variation,
            );

          if (!createResult.success) {
            Logger.error(
              `Failed to create variation ${variation.sku}: ${createResult.error}`,
              ProductEventService.loggerCtx,
            );
          } else {
            Logger.info(
              `[VARIATIONS] Created variation sku=${variation.sku} wpVariationId=${createResult.data?.id ?? "n/a"}`,
              ProductEventService.loggerCtx,
            );
          }
        }
      }

      Logger.info(
        `Synced ${variations.length} variation(s) for ${productName}`,
        ProductEventService.loggerCtx,
      );
    } catch (error) {
      Logger.error(
        `Error syncing variations to WordPress: ${error instanceof Error ? error.message : String(error)}`,
        ProductEventService.loggerCtx,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
