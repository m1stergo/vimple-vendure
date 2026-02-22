import { Args, Query, Mutation, Resolver } from "@nestjs/graphql";
import {
  Allow,
  Ctx,
  ListQueryOptions,
  Permission,
  ProductService,
  RequestContext,
  RequestContextService,
  ChannelService,
} from "@vendure/core";

const DEFAULT_CHANNEL_CODE = "__default_channel__";

@Resolver()
export class ChannelProductsAdminResolver {
  constructor(
    private productService: ProductService,
    private channelService: ChannelService,
    private requestContextService: RequestContextService,
  ) {}

  @Query()
  @Allow(Permission.ReadCatalog)
  async productsByChannel(
    @Ctx() ctx: RequestContext,
    @Args("channelId") channelId: string,
    @Args("options") options?: ListQueryOptions<any>,
  ) {
    const channel = await this.channelService.findOne(ctx, channelId);
    if (!channel) {
      throw new Error(`Channel with id ${channelId} not found`);
    }

    const ctxForChannel = await this.requestContextService.create({
      apiType: ctx.apiType,
      channelOrToken: channel.token,
      languageCode: ctx.languageCode,
    });

    return this.productService.findAll(ctxForChannel, options);
  }

  @Query()
  @Allow(Permission.ReadCatalog)
  async channelsWithProductCount(@Ctx() ctx: RequestContext) {
    const channels = await this.channelService.findAll(ctx);

    const channelsWithCount = await Promise.all(
      channels.items.map(async (channel) => {
        const ctxForChannel = await this.requestContextService.create({
          apiType: ctx.apiType,
          channelOrToken: channel.token,
          languageCode: ctx.languageCode,
        });

        const products = await this.productService.findAll(ctxForChannel, {
          take: 0,
        });

        return {
          ...channel,
          productCount: products.totalItems,
        };
      }),
    );

    return channelsWithCount;
  }

  @Mutation()
  @Allow(Permission.UpdateCatalog)
  async addProductToChannel(
    @Ctx() ctx: RequestContext,
    @Args("productId") productId: string,
    @Args("channelId") channelId: string,
  ) {
    const channel = await this.channelService.findOne(ctx, channelId);
    if (!channel) {
      throw new Error(`Channel with id ${channelId} not found`);
    }

    const product = await this.productService.findOne(ctx, productId);
    if (!product) {
      throw new Error(`Product with id ${productId} not found`);
    }

    const markupPercentage = Number((channel.customFields as any)?.markup ?? 0);
    const priceFactor = 1 + markupPercentage / 100;

    await this.productService.assignProductsToChannel(ctx, {
      productIds: [productId],
      channelId,
      priceFactor,
    });

    return this.productService.findOne(ctx, productId);
  }

  @Mutation()
  @Allow(Permission.UpdateCatalog)
  async removeProductFromChannel(
    @Ctx() ctx: RequestContext,
    @Args("productId") productId: string,
    @Args("channelId") channelId: string,
  ) {
    const channel = await this.channelService.findOne(ctx, channelId);
    if (!channel) {
      throw new Error(`Channel with id ${channelId} not found`);
    }

    const product = await this.productService.findOne(ctx, productId);
    if (!product) {
      throw new Error(`Product with id ${productId} not found`);
    }

    await this.productService.removeProductsFromChannel(ctx, {
      productIds: [productId],
      channelId,
    });

    // Si se remueve del canal default, también remover de todos los demás canales
    // para mantener consistencia con la fuente principal de productos.
    if (channel.code === DEFAULT_CHANNEL_CODE) {
      const channels = await this.channelService.findAll(ctx);
      for (const targetChannel of channels.items) {
        if (targetChannel.code === DEFAULT_CHANNEL_CODE) {
          continue;
        }
        await this.productService.removeProductsFromChannel(ctx, {
          productIds: [productId],
          channelId: String(targetChannel.id),
        });
      }
    }

    return this.productService.findOne(ctx, productId);
  }
}
