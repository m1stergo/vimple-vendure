import { Args, Mutation, Query, Resolver } from "@nestjs/graphql";
import {
  Ctx,
  RequestContext,
  Allow,
  Permission,
  ID,
  PaginatedList,
  UserInputError,
} from "@vendure/core";
import { IntegrationService } from "../services/integration.service";
import { Integration, IntegrationType } from "../entities/integration.entity";
import { IntegrationFeatureId } from "../integration-features";

@Resolver()
export class IntegrationAdminResolver {
  constructor(private integrationService: IntegrationService) {}

  private parseConfig(config: string): Record<string, string> {
    try {
      const parsed = JSON.parse(config);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Config must be a JSON object");
      }
      return parsed as Record<string, string>;
    } catch (e) {
      throw new UserInputError("Invalid integration config JSON");
    }
  }

  @Query()
  @Allow(Permission.ReadSettings)
  async integrations(
    @Ctx() ctx: RequestContext,
    @Args() args: { options?: any },
  ): Promise<PaginatedList<Integration>> {
    return this.integrationService.findAll(ctx, args.options);
  }

  @Query()
  @Allow(Permission.ReadSettings)
  async integration(
    @Ctx() ctx: RequestContext,
    @Args() args: { id: ID },
  ): Promise<Integration | null> {
    return this.integrationService.findOne(ctx, args.id);
  }

  @Mutation()
  @Allow(Permission.UpdateSettings)
  async createIntegration(
    @Ctx() ctx: RequestContext,
    @Args()
    args: {
      input: {
        name: string;
        type: IntegrationType;
        config: string;
        enabledFeatures?: string[];
      };
    },
  ): Promise<Integration> {
    return this.integrationService.create(ctx, {
      name: args.input.name,
      type: args.input.type,
      config: this.parseConfig(args.input.config),
      enabledFeatures: (args.input.enabledFeatures ||
        []) as IntegrationFeatureId[],
    });
  }

  @Mutation()
  @Allow(Permission.UpdateSettings)
  async updateIntegration(
    @Ctx() ctx: RequestContext,
    @Args()
    args: {
      id: ID;
      input: {
        name?: string;
        config?: string;
        enabled?: boolean;
        enabledFeatures?: string[];
      };
    },
  ): Promise<Integration | null> {
    return this.integrationService.update(ctx, args.id, {
      name: args.input.name,
      config: args.input.config
        ? this.parseConfig(args.input.config)
        : undefined,
      enabled: args.input.enabled,
      enabledFeatures: args.input.enabledFeatures as
        | IntegrationFeatureId[]
        | undefined,
    });
  }

  @Mutation()
  @Allow(Permission.UpdateSettings)
  async deleteIntegration(
    @Ctx() ctx: RequestContext,
    @Args() args: { id: ID },
  ): Promise<{ result: string; message: string }> {
    const success = await this.integrationService.delete(ctx, args.id);
    return {
      result: success ? "DELETED" : "NOT_DELETED",
      message: success
        ? "Integration deleted successfully"
        : "Integration not found",
    };
  }
}
