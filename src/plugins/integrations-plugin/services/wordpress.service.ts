import { Injectable } from "@nestjs/common";
import { Logger } from "@vendure/core";
import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";
import { Integration } from "../entities/integration.entity";

export interface WordPressProductVariation {
  id?: number;
  sku: string;
  description?: string;
  regular_price: string;
  sale_price?: string;
  stock_quantity?: number;
  low_stock_amount?: number;
  manage_stock: boolean;
  stock_status: "instock" | "outofstock" | "onbackorder";
  image?: {
    src: string;
    name?: string;
    alt?: string;
  };
  attributes?: Array<{
    name: string;
    option: string;
  }>;
  meta_data?: Array<{
    key: string;
    value: any;
  }>;
}

export interface WordPressProductAttribute {
  name: string;
  position: number;
  visible: boolean;
  variation: boolean;
  options: string[];
}

export interface WordPressProduct {
  id?: number;
  name: string;
  type: "simple" | "variable";
  status: "publish" | "draft" | "pending";
  description: string;
  short_description: string;
  sku?: string;
  regular_price?: string;
  sale_price?: string;
  stock_quantity?: number;
  low_stock_amount?: number;
  manage_stock?: boolean;
  stock_status?: "instock" | "outofstock" | "onbackorder";
  images?: Array<{
    src: string;
    name?: string;
    alt?: string;
  }>;
  categories?: Array<{
    id: number;
  }>;
  tags?: Array<{
    id: number;
  }>;
  attributes?: WordPressProductAttribute[];
  meta_data?: Array<{
    key: string;
    value: any;
  }>;
}

export interface WordPressApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface WordPressMappedFacetValue {
  facetCode: string;
  facetName: string;
  valueCode: string;
  valueName: string;
}

@Injectable()
export class WordPressService {
  private static readonly loggerCtx = "WordPressService";

  private getIntegrationLabel(integration: Integration): string {
    return `${integration.id}:${integration.name}`;
  }

  private formatApiError(error: any): string {
    const status = error?.response?.status;
    const code = error?.response?.data?.code;
    const message =
      error?.response?.data?.message || error?.message || String(error);
    const params = error?.response?.data?.data?.params;
    const paramDetails = params
      ? ` params=${JSON.stringify(params).slice(0, 500)}`
      : "";
    return `status=${status ?? "n/a"} code=${code ?? "n/a"} message=${message}${paramDetails}`;
  }

  private getApiClient(integration: Integration): WooCommerceRestApi | null {
    const { siteUrl, apiKey, apiSecret } = integration.config;

    if (!siteUrl || !apiKey || !apiSecret) {
      return null;
    }

    return new WooCommerceRestApi({
      url: this.normalizeUrl(siteUrl),
      consumerKey: apiKey,
      consumerSecret: apiSecret,
      version: "wc/v3",
    });
  }

  async mapFacetValuesToTaxonomies(
    integration: Integration,
    facetValues: WordPressMappedFacetValue[],
  ): Promise<
    WordPressApiResponse<{
      categories: Array<{ id: number }>;
      tags: Array<{ id: number }>;
    }>
  > {
    const api = this.getApiClient(integration);

    if (!api) {
      return {
        success: false,
        error:
          "Missing WordPress configuration (siteUrl, apiKey, or apiSecret)",
      };
    }

    try {
      const categories: Array<{ id: number }> = [];
      const tags: Array<{ id: number }> = [];
      const categoryIds = new Set<number>();
      const tagIds = new Set<number>();

      for (const facetValue of facetValues) {
        const isCategoryFacet = this.isCategoryFacet(
          facetValue.facetCode,
          facetValue.facetName,
        );
        const termName = facetValue.valueName || facetValue.valueCode;
        if (!termName) {
          continue;
        }

        if (isCategoryFacet) {
          const categoryId = await this.findOrCreateTermId(
            api,
            "products/categories",
            termName,
          );
          if (categoryId && !categoryIds.has(categoryId)) {
            categoryIds.add(categoryId);
            categories.push({ id: categoryId });
          }
        } else {
          const tagId = await this.findOrCreateTermId(
            api,
            "products/tags",
            termName,
          );
          if (tagId && !tagIds.has(tagId)) {
            tagIds.add(tagId);
            tags.push({ id: tagId });
          }
        }
      }

      return {
        success: true,
        data: {
          categories,
          tags,
        },
      };
    } catch (error: any) {
      const errorMessage = this.formatApiError(error);
      Logger.error(
        `Error mapping facet values to WooCommerce taxonomies integration=${this.getIntegrationLabel(integration)} ${errorMessage}`,
        WordPressService.loggerCtx,
        error.stack,
      );
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async createProduct(
    integration: Integration,
    productData: WordPressProduct,
  ): Promise<WordPressApiResponse<WordPressProduct>> {
    const api = this.getApiClient(integration);

    if (!api) {
      return {
        success: false,
        error:
          "Missing WordPress configuration (siteUrl, apiKey, or apiSecret)",
      };
    }

    try {
      const payload = this.sanitizeProductPayload(productData);
      Logger.info(
        `[HTTP] POST products integration=${this.getIntegrationLabel(integration)} sku=${payload.sku || "n/a"} name="${payload.name}"`,
        WordPressService.loggerCtx,
      );

      const response = await api.post("products", payload);
      const data = response.data;

      Logger.info(
        `[HTTP] POST products OK integration=${this.getIntegrationLabel(integration)} wpId=${data.id} name="${data.name}"`,
        WordPressService.loggerCtx,
      );

      return {
        success: true,
        data,
      };
    } catch (error: any) {
      const errorMessage = this.formatApiError(error);
      Logger.error(
        `Error creating product in WordPress integration=${this.getIntegrationLabel(integration)} ${errorMessage}`,
        WordPressService.loggerCtx,
        error.stack,
      );
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async updateProduct(
    integration: Integration,
    wordpressProductId: number,
    productData: Partial<WordPressProduct>,
  ): Promise<WordPressApiResponse<WordPressProduct>> {
    const api = this.getApiClient(integration);

    if (!api) {
      return {
        success: false,
        error:
          "Missing WordPress configuration (siteUrl, apiKey, or apiSecret)",
      };
    }

    try {
      const payload = this.sanitizeProductPayload(productData);
      Logger.info(
        `[HTTP] PUT products/${wordpressProductId} integration=${this.getIntegrationLabel(integration)} sku=${payload.sku || "n/a"}`,
        WordPressService.loggerCtx,
      );

      const response = await api.put(`products/${wordpressProductId}`, payload);
      const data = response.data;

      Logger.info(
        `[HTTP] PUT products/${wordpressProductId} OK integration=${this.getIntegrationLabel(integration)} wpId=${data.id}`,
        WordPressService.loggerCtx,
      );

      return {
        success: true,
        data,
      };
    } catch (error: any) {
      const errorMessage = this.formatApiError(error);
      Logger.error(
        `Error updating product in WordPress integration=${this.getIntegrationLabel(integration)} ${errorMessage}`,
        WordPressService.loggerCtx,
        error.stack,
      );
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async deleteProduct(
    integration: Integration,
    wordpressProductId: number,
  ): Promise<WordPressApiResponse> {
    const api = this.getApiClient(integration);

    if (!api) {
      return {
        success: false,
        error:
          "Missing WordPress configuration (siteUrl, apiKey, or apiSecret)",
      };
    }

    try {
      Logger.info(
        `[HTTP] DELETE products/${wordpressProductId} integration=${this.getIntegrationLabel(integration)}`,
        WordPressService.loggerCtx,
      );

      await api.delete(`products/${wordpressProductId}`, { force: true });

      Logger.info(
        `[HTTP] DELETE products/${wordpressProductId} OK integration=${this.getIntegrationLabel(integration)}`,
        WordPressService.loggerCtx,
      );

      return {
        success: true,
      };
    } catch (error: any) {
      const errorMessage = this.formatApiError(error);
      Logger.error(
        `Error deleting product in WordPress integration=${this.getIntegrationLabel(integration)} ${errorMessage}`,
        WordPressService.loggerCtx,
        error.stack,
      );
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async getProduct(
    integration: Integration,
    wordpressProductId: number,
  ): Promise<WordPressApiResponse<WordPressProduct>> {
    const api = this.getApiClient(integration);

    if (!api) {
      return {
        success: false,
        error:
          "Missing WordPress configuration (siteUrl, apiKey, or apiSecret)",
      };
    }

    try {
      const response = await api.get(`products/${wordpressProductId}`);
      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || error.message || String(error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async findProductBySku(
    integration: Integration,
    sku: string,
  ): Promise<WordPressApiResponse<WordPressProduct | null>> {
    const api = this.getApiClient(integration);

    if (!api) {
      return {
        success: false,
        error:
          "Missing WordPress configuration (siteUrl, apiKey, or apiSecret)",
      };
    }

    try {
      Logger.info(
        `[HTTP] GET products?sku=${sku} integration=${this.getIntegrationLabel(integration)}`,
        WordPressService.loggerCtx,
      );
      const response = await api.get("products", { sku });
      const data = response.data;

      return {
        success: true,
        data: data.length > 0 ? data[0] : null,
      };
    } catch (error: any) {
      const errorMessage = this.formatApiError(error);
      Logger.error(
        `Error finding product by SKU in WordPress integration=${this.getIntegrationLabel(integration)} sku=${sku} ${errorMessage}`,
        WordPressService.loggerCtx,
        error.stack,
      );
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async testConnection(
    integration: Integration,
  ): Promise<WordPressApiResponse> {
    const api = this.getApiClient(integration);

    if (!api) {
      return {
        success: false,
        error:
          "Missing WordPress configuration (siteUrl, apiKey, or apiSecret)",
      };
    }

    try {
      await api.get("system_status");

      Logger.info(
        `WordPress connection test successful for ${integration.config.siteUrl}`,
        WordPressService.loggerCtx,
      );

      return {
        success: true,
        data: { message: "Connection successful" },
      };
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || error.message || String(error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async createProductVariation(
    integration: Integration,
    productId: number,
    variationData: WordPressProductVariation,
  ): Promise<WordPressApiResponse<WordPressProductVariation>> {
    const api = this.getApiClient(integration);

    if (!api) {
      return {
        success: false,
        error:
          "Missing WordPress configuration (siteUrl, apiKey, or apiSecret)",
      };
    }

    try {
      const payload = this.sanitizeVariationPayload(variationData);
      Logger.info(
        `[HTTP] POST products/${productId}/variations integration=${this.getIntegrationLabel(integration)} sku=${payload.sku} hasImage=${payload.image ? "yes" : "no"} attributes=${payload.attributes?.length ?? 0}`,
        WordPressService.loggerCtx,
      );

      const response = await api.post(
        `products/${productId}/variations`,
        payload,
      );
      const data = response.data;

      Logger.info(
        `[HTTP] POST products/${productId}/variations OK integration=${this.getIntegrationLabel(integration)} sku=${data.sku} wpVariationId=${data.id}`,
        WordPressService.loggerCtx,
      );

      return {
        success: true,
        data,
      };
    } catch (error: any) {
      const errorMessage = this.formatApiError(error);
      Logger.error(
        `Error creating variation in WordPress integration=${this.getIntegrationLabel(integration)} productId=${productId} sku=${variationData.sku} ${errorMessage}`,
        WordPressService.loggerCtx,
        error.stack,
      );
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async updateProductVariation(
    integration: Integration,
    productId: number,
    variationId: number,
    variationData: Partial<WordPressProductVariation>,
  ): Promise<WordPressApiResponse<WordPressProductVariation>> {
    const api = this.getApiClient(integration);

    if (!api) {
      return {
        success: false,
        error:
          "Missing WordPress configuration (siteUrl, apiKey, or apiSecret)",
      };
    }

    try {
      const payload = this.sanitizeVariationPayload(variationData);
      Logger.info(
        `[HTTP] PUT products/${productId}/variations/${variationId} integration=${this.getIntegrationLabel(integration)} sku=${payload.sku || "n/a"} hasImage=${payload.image ? "yes" : "no"} attributes=${payload.attributes?.length ?? 0}`,
        WordPressService.loggerCtx,
      );

      const response = await api.put(
        `products/${productId}/variations/${variationId}`,
        payload,
      );
      const data = response.data;

      Logger.info(
        `[HTTP] PUT products/${productId}/variations/${variationId} OK integration=${this.getIntegrationLabel(integration)} sku=${data.sku} wpVariationId=${data.id}`,
        WordPressService.loggerCtx,
      );

      return {
        success: true,
        data,
      };
    } catch (error: any) {
      const errorMessage = this.formatApiError(error);
      Logger.error(
        `Error updating variation in WordPress integration=${this.getIntegrationLabel(integration)} productId=${productId} variationId=${variationId} sku=${variationData.sku || "n/a"} ${errorMessage}`,
        WordPressService.loggerCtx,
        error.stack,
      );
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async getProductVariations(
    integration: Integration,
    productId: number,
  ): Promise<WordPressApiResponse<WordPressProductVariation[]>> {
    const api = this.getApiClient(integration);

    if (!api) {
      return {
        success: false,
        error:
          "Missing WordPress configuration (siteUrl, apiKey, or apiSecret)",
      };
    }

    try {
      Logger.info(
        `[HTTP] GET products/${productId}/variations integration=${this.getIntegrationLabel(integration)}`,
        WordPressService.loggerCtx,
      );
      const response = await api.get(`products/${productId}/variations`, {
        per_page: 100,
      });

      Logger.info(
        `[HTTP] GET products/${productId}/variations OK integration=${this.getIntegrationLabel(integration)} count=${Array.isArray(response.data) ? response.data.length : 0}`,
        WordPressService.loggerCtx,
      );

      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      const errorMessage = this.formatApiError(error);
      Logger.error(
        `Error reading variations in WordPress integration=${this.getIntegrationLabel(integration)} productId=${productId} ${errorMessage}`,
        WordPressService.loggerCtx,
        error.stack,
      );
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  private normalizeUrl(url: string): string {
    return url.replace(/\/$/, "");
  }

  private sanitizeProductPayload<T extends Partial<WordPressProduct>>(
    payload: T,
  ): T {
    const sanitized = { ...payload } as T;
    const sanitizedAttributes = this.sanitizeProductAttributes(
      sanitized.attributes,
    );
    if (sanitizedAttributes) {
      (sanitized as Partial<WordPressProduct>).attributes = sanitizedAttributes;
    } else {
      delete (sanitized as Partial<WordPressProduct>).attributes;
    }

    if (!Array.isArray(sanitized.images)) {
      return sanitized;
    }

    const unique = new Set<string>();
    const validImages = sanitized.images.filter((image) => {
      const src = image?.src?.trim();
      if (!src) {
        return false;
      }
      if (!this.isValidExternalImageUrl(src)) {
        return false;
      }
      if (unique.has(src)) {
        return false;
      }
      unique.add(src);
      return true;
    });

    if (validImages.length !== sanitized.images.length) {
      Logger.warn(
        `Dropping ${sanitized.images.length - validImages.length} invalid/duplicate image(s) from WooCommerce payload`,
        WordPressService.loggerCtx,
      );
    }

    if (validImages.length === 0) {
      delete (sanitized as Partial<WordPressProduct>).images;
      return sanitized;
    }

    (sanitized as Partial<WordPressProduct>).images = validImages;
    return sanitized;
  }

  private sanitizeVariationPayload<
    T extends Partial<WordPressProductVariation>,
  >(payload: T): T {
    const sanitized = { ...payload } as T;

    if (Array.isArray(sanitized.attributes)) {
      const attributes = sanitized.attributes
        .map((attribute) => ({
          name:
            typeof attribute?.name === "string"
              ? attribute.name.trim()
              : String(attribute?.name ?? "").trim(),
          option:
            typeof attribute?.option === "string"
              ? attribute.option.trim()
              : String(attribute?.option ?? "").trim(),
        }))
        .filter(
          (attribute) =>
            attribute.name.length > 0 && attribute.option.length > 0,
        );

      if (attributes.length > 0) {
        (sanitized as Partial<WordPressProductVariation>).attributes =
          attributes;
      } else {
        delete (sanitized as Partial<WordPressProductVariation>).attributes;
      }
    }

    if (
      sanitized.image?.src &&
      !this.isValidExternalImageUrl(sanitized.image.src)
    ) {
      delete (sanitized as Partial<WordPressProductVariation>).image;
    }

    return sanitized;
  }

  private sanitizeProductAttributes(
    attributes: WordPressProductAttribute[] | undefined,
  ): WordPressProductAttribute[] | undefined {
    if (!Array.isArray(attributes)) {
      return undefined;
    }

    const sanitized: WordPressProductAttribute[] = [];
    const names = new Set<string>();
    let position = 0;

    for (const attribute of attributes) {
      const name =
        typeof attribute?.name === "string" ? attribute.name.trim() : "";
      if (!name || names.has(name.toLowerCase())) {
        continue;
      }

      const rawOptions = Array.isArray(attribute.options)
        ? attribute.options
        : [];
      const options = Array.from(
        new Set(
          rawOptions
            .map((option) =>
              typeof option === "string" ? option.trim() : String(option ?? ""),
            )
            .filter(Boolean),
        ),
      );

      if (options.length === 0) {
        continue;
      }

      names.add(name.toLowerCase());
      sanitized.push({
        name,
        position: position++,
        visible: attribute.visible !== false,
        variation: attribute.variation !== false,
        options,
      });
    }

    return sanitized.length > 0 ? sanitized : undefined;
  }

  private isValidExternalImageUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return false;
      }
      const hostname = parsed.hostname.toLowerCase();
      if (!hostname || hostname === "source") {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  private isCategoryFacet(facetCode: string, facetName: string): boolean {
    const normalized = `${facetCode} ${facetName}`.toLowerCase();
    return (
      normalized.includes("category") ||
      normalized.includes("categories") ||
      normalized.includes("categoria") ||
      normalized.includes("categorias")
    );
  }

  private async findOrCreateTermId(
    api: WooCommerceRestApi,
    endpoint: "products/categories" | "products/tags",
    termName: string,
  ): Promise<number | null> {
    const existing = await this.findTermByName(api, endpoint, termName);
    if (existing?.id) {
      return existing.id;
    }

    const createResponse = await api.post(endpoint, { name: termName });
    return createResponse?.data?.id ?? null;
  }

  private async findTermByName(
    api: WooCommerceRestApi,
    endpoint: "products/categories" | "products/tags",
    termName: string,
  ): Promise<{ id: number } | null> {
    const response = await api.get(endpoint, {
      search: termName,
      per_page: 100,
    });
    const terms = Array.isArray(response?.data) ? response.data : [];
    const normalizedName = termName.trim().toLowerCase();
    const exact = terms.find(
      (term: any) =>
        typeof term?.name === "string" &&
        term.name.trim().toLowerCase() === normalizedName,
    );
    if (exact?.id) {
      return { id: exact.id };
    }
    return null;
  }
}
