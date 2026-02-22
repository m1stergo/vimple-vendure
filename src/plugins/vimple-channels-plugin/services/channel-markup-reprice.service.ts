import { Injectable, OnModuleInit } from "@nestjs/common";
import {
  Channel,
  ChannelEvent,
  ChannelService,
  EventBus,
  Job,
  JobQueue,
  JobQueueService,
  Logger,
  Product,
  ProductVariant,
  ProductVariantPrice,
  RequestContext,
  RequestContextService,
  TransactionalConnection,
  ProductEvent,
} from "@vendure/core";
import { filter } from "rxjs/operators";
import { In } from "typeorm";

interface ChannelMarkupRepriceJobData {
  channelId: number;
  requestedMarkup: number;
}

const loggerCtx = "ChannelMarkupRepriceService";
const REPRICE_BATCH_SIZE = 250;

@Injectable()
export class ChannelMarkupRepriceService implements OnModuleInit {
  private repriceQueue!: JobQueue<ChannelMarkupRepriceJobData>;

  constructor(
    private eventBus: EventBus,
    private jobQueueService: JobQueueService,
    private connection: TransactionalConnection,
    private requestContextService: RequestContextService,
    private channelService: ChannelService,
  ) {}

  async onModuleInit() {
    this.repriceQueue = await this.jobQueueService.createQueue({
      name: "channel-markup-reprice",
      process: async (job) => this.processRepriceJob(job),
    });

    this.eventBus
      .ofType(ChannelEvent)
      .pipe(filter((event) => event.type === "updated"))
      .subscribe(async (event) => {
        await this.handleChannelUpdated(event);
      });
  }

  private async handleChannelUpdated(event: ChannelEvent) {
    const markup = this.readMarkupFromInput(event.input);
    if (markup === undefined) {
      return;
    }

    const channelId = Number(event.entity.id);
    if (!Number.isFinite(channelId) || channelId <= 0) {
      return;
    }

    await this.repriceQueue.add(
      {
        channelId,
        requestedMarkup: markup,
      },
      { retries: 2 },
    );

    Logger.info(
      `[QUEUE] Enqueued channel markup reprice channelId=${channelId} requestedMarkup=${markup}`,
      loggerCtx,
    );
  }

  private async processRepriceJob(job: Job<ChannelMarkupRepriceJobData>) {
    const { channelId, requestedMarkup } = job.data;
    const channel = await this.connection.rawConnection
      .getRepository(Channel)
      .findOne({
        where: { id: channelId },
      });

    if (!channel) {
      Logger.warn(
        `[QUEUE] Channel not found channelId=${channelId}. Skipping reprice.`,
        loggerCtx,
      );
      return;
    }

    const currentMarkup = Number((channel.customFields as any)?.markup ?? 0);
    const priceFactor = 1 + currentMarkup / 100;

    const channelCtx = await this.requestContextService.create({
      apiType: "admin",
      channelOrToken: channel.token,
    });

    Logger.info(
      `[QUEUE] Start channel reprice channelId=${channelId} requestedMarkup=${requestedMarkup} currentMarkup=${currentMarkup} priceFactor=${priceFactor}`,
      loggerCtx,
    );
    const defaultChannel =
      await this.channelService.getDefaultChannel(channelCtx);

    Logger.info(
      `[QUEUE] Loading product ids for channelId=${channelId}`,
      loggerCtx,
    );
    const allProductIds = await this.getAllProductIdsForChannel(
      channelCtx,
      channelId,
    );
    const totalProducts = allProductIds.length;
    const totalBatches =
      totalProducts > 0 ? Math.ceil(totalProducts / REPRICE_BATCH_SIZE) : 0;
    Logger.info(
      `[QUEUE] Loaded product ids channelId=${channelId} totalProducts=${totalProducts} totalBatches=${totalBatches}`,
      loggerCtx,
    );

    let processed = 0;
    let batchNumber = 0;

    for (let i = 0; i < allProductIds.length; i += REPRICE_BATCH_SIZE) {
      const productIds = allProductIds.slice(i, i + REPRICE_BATCH_SIZE);
      batchNumber += 1;

      Logger.info(
        `[QUEUE] Processing batch channelId=${channelId} progress=${batchNumber}/${totalBatches || 1} batchSize=${productIds.length}`,
        loggerCtx,
      );

      await this.repriceVariantPricesForProducts(
        channelCtx,
        productIds,
        Number(defaultChannel.id),
        channelId,
        channel.defaultCurrencyCode,
        priceFactor,
      );
      await this.publishProductUpdatedEvents(channelCtx, productIds);

      processed += productIds.length;

      if (totalBatches > 0) {
        const progressPercent = Math.min(
          100,
          Math.round((batchNumber / totalBatches) * 100),
        );
        job.setProgress(progressPercent);
      }

      Logger.info(
        `[QUEUE] Repriced batch channelId=${channelId} progress=${batchNumber}/${totalBatches || 1} batchSize=${productIds.length} processed=${processed}/${totalProducts}`,
        loggerCtx,
      );
    }

    Logger.info(
      `[QUEUE] Channel reprice completed channelId=${channelId} processedProducts=${processed}`,
      loggerCtx,
    );
  }

  private async publishProductUpdatedEvents(
    ctx: RequestContext,
    productIds: number[],
  ) {
    for (const productId of productIds) {
      await this.eventBus.publish(
        new ProductEvent(ctx, { id: productId } as any, "updated"),
      );
    }
  }

  private async repriceVariantPricesForProducts(
    ctx: RequestContext,
    productIds: number[],
    defaultChannelId: number,
    targetChannelId: number,
    targetCurrencyCode: string,
    priceFactor: number,
  ) {
    const variants = await this.connection
      .getRepository(ctx, ProductVariant)
      .find({
        where: {
          productId: In(productIds),
        },
        relations: ["productVariantPrices"],
      });

    const pricesToSave: ProductVariantPrice[] = [];

    for (const variant of variants) {
      const basePrice = variant.productVariantPrices?.find(
        (p) => Number(p.channelId) === defaultChannelId,
      );
      if (!basePrice) {
        continue;
      }

      const nextPrice = Math.round(basePrice.price * priceFactor);
      const currentTargetPrice = variant.productVariantPrices?.find(
        (p) => Number(p.channelId) === targetChannelId,
      );

      if (currentTargetPrice) {
        currentTargetPrice.price = nextPrice;
        currentTargetPrice.currencyCode = targetCurrencyCode as any;
        pricesToSave.push(currentTargetPrice);
      } else {
        pricesToSave.push(
          new ProductVariantPrice({
            variant,
            channelId: targetChannelId,
            currencyCode: targetCurrencyCode as any,
            price: nextPrice,
          }),
        );
      }
    }

    if (pricesToSave.length > 0) {
      await this.connection
        .getRepository(ctx, ProductVariantPrice)
        .save(pricesToSave);
    }
  }

  private async getAllProductIdsForChannel(
    ctx: RequestContext,
    channelId: number,
  ): Promise<number[]> {
    const rows = await this.connection
      .getRepository(ctx, Product)
      .createQueryBuilder("product")
      .innerJoin("product.channels", "channel", "channel.id = :channelId", {
        channelId,
      })
      .select("product.id", "id")
      .orderBy("product.id", "ASC")
      .getRawMany<{ id: string }>();

    return rows
      .map((row) => Number(row.id))
      .filter((id) => Number.isFinite(id) && id > 0);
  }

  private readMarkupFromInput(input: unknown): number | undefined {
    if (!input || typeof input !== "object") {
      return undefined;
    }

    const customFields = (input as any).customFields;
    if (!customFields || typeof customFields !== "object") {
      return undefined;
    }

    if (!Object.prototype.hasOwnProperty.call(customFields, "markup")) {
      return undefined;
    }

    const parsed = Number((customFields as any).markup ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
