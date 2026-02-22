import {
  Channel,
  Injector,
  PriceCalculationResult,
  ProductVariantPriceCalculationArgs,
  ProductVariantPriceCalculationStrategy,
  TransactionalConnection,
} from "@vendure/core";

/**
 * Aplica un markup porcentual por canal sobre el precio base del producto.
 */
export class ChannelMarkupPriceStrategy
  implements ProductVariantPriceCalculationStrategy
{
  private connection: TransactionalConnection;

  init(injector: Injector) {
    this.connection = injector.get(TransactionalConnection);
  }

  async calculate(
    args: ProductVariantPriceCalculationArgs,
  ): Promise<PriceCalculationResult> {
    const { inputPrice, ctx } = args;

    const channel = await this.connection.getRepository(ctx, Channel).findOne({
      where: { id: ctx.channelId },
    });

    const markupPercentage = Number((channel?.customFields as any)?.markup ?? 0);
    const priceWithMarkup = Math.round(inputPrice * (1 + markupPercentage / 100));

    return {
      price: priceWithMarkup,
      priceIncludesTax: ctx.channel.pricesIncludeTax,
    };
  }
}
