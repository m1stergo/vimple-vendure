import { Args, Mutation, Query, Resolver } from "@nestjs/graphql";
import {
  Allow,
  Ctx,
  ID,
  ListQueryOptions,
  Logger,
  Permission,
  Product,
  ProductService,
  RequestContext,
  RequestContextService,
  ChannelService,
  TransactionalConnection,
} from "@vendure/core";

const loggerCtx = "SeleccionarProductosAdminResolver";

@Resolver()
export class SeleccionarProductosAdminResolver {
  constructor(
    private productService: ProductService,
    private channelService: ChannelService,
    private connection: TransactionalConnection,
    private requestContextService: RequestContextService,
  ) {}

  @Query()
  @Allow(Permission.ReadCatalog)
  async productsWithChannelStatus(
    @Ctx() ctx: RequestContext,
    @Args("options") options?: ListQueryOptions<any>,
  ) {
    const currentChannelId = Number(ctx.channelId);
    const defaultChannel = await this.channelService.getDefaultChannel(ctx);

    const ctxForDefaultChannel = await this.requestContextService.create({
      apiType: ctx.apiType,
      channelOrToken: defaultChannel.token,
      languageCode: ctx.languageCode,
    });

    const productsResult = await this.productService.findAll(
      ctxForDefaultChannel,
      options,
    );
    const productIds = productsResult.items.map((product) =>
      Number(product.id),
    );

    const assignedProductIdSet = new Set<number>();

    if (productIds.length > 0) {
      const rows = await this.connection
        .getRepository(ctx, Product)
        .createQueryBuilder("product")
        .leftJoin("product.channels", "channel")
        .select("product.id", "productId")
        .addSelect("channel.id", "channelId")
        .where("product.id IN (:...productIds)", { productIds })
        .andWhere("channel.id = :channelId", { channelId: currentChannelId })
        .getRawMany<{ productId: string; channelId: string }>();

      for (const row of rows) {
        assignedProductIdSet.add(Number(row.productId));
      }
    }

    const items = productsResult.items.map((product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      enabled: product.enabled,
      featuredAsset: product.featuredAsset,
      isAssignedToChannel: assignedProductIdSet.has(Number(product.id)),
    }));

    return {
      items,
      totalItems: productsResult.totalItems,
    };
  }

  @Mutation()
  @Allow(Permission.UpdateCatalog)
  async bulkAssignProductsToChannel(
    @Ctx() ctx: RequestContext,
    @Args("productIds") productIds: ID[],
  ) {
    const channelId = ctx.channelId;
    const markupPercentage = Number(
      (ctx.channel.customFields as any)?.markup ?? 0,
    );
    const priceFactor = 1 + markupPercentage / 100;

    try {
      await this.productService.assignProductsToChannel(ctx, {
        productIds,
        channelId,
        priceFactor,
      });

      const results = [];
      for (const productId of productIds) {
        const product = await this.productService.findOne(ctx, productId);
        if (product) {
          results.push(product);
        }
      }
      return results;
    } catch (error) {
      Logger.error(
        `Error assigning products to channel ${channelId}: ${error instanceof Error ? error.message : String(error)}`,
        loggerCtx,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  @Mutation()
  @Allow(Permission.UpdateCatalog)
  async bulkRemoveProductsFromChannel(
    @Ctx() ctx: RequestContext,
    @Args("productIds") productIds: ID[],
  ) {
    const channelId = ctx.channelId;

    try {
      await this.productService.removeProductsFromChannel(ctx, {
        productIds,
        channelId,
      });

      const results = [];
      for (const productId of productIds) {
        const product = await this.productService.findOne(ctx, productId);
        if (product) {
          results.push(product);
        }
      }
      return results;
    } catch (error) {
      Logger.error(
        `Error removing products from channel ${channelId}: ${error instanceof Error ? error.message : String(error)}`,
        loggerCtx,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }
}
