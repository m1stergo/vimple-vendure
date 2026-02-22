import { Injectable, Logger } from "@nestjs/common";
import {
  WordPressProduct,
  WordPressProductVariation,
  WordPressProductAttribute,
  WordPressMappedFacetValue,
} from "./wordpress.service";

export interface MappedWordPressProduct {
  product: WordPressProduct;
  variations?: WordPressProductVariation[];
  facetValues: WordPressMappedFacetValue[];
}

@Injectable()
export class ProductMapperService {
  private static readonly loggerCtx = "ProductMapperService";
  private readonly assetBaseUrl = process.env.S3_PUBLIC_URL?.replace(
    /\/+$/,
    "",
  );

  vendureToWordPress(vendureProduct: any): MappedWordPressProduct {
    const translation = vendureProduct.translations?.[0];
    const name = translation?.name || vendureProduct.name || "Untitled Product";
    const description = translation?.description || "";
    const shortDescription =
      translation?.customFields?.shortDescription ||
      description.substring(0, 200);
    const slug = translation?.slug || vendureProduct.slug || "";
    const variants = vendureProduct.variants || [];

    Logger.debug(
      `Mapping product: ${name} (ID: ${vendureProduct.id}) with ${variants.length} variant(s)`,
      ProductMapperService.loggerCtx,
    );

    const images = this.getProductImages(vendureProduct);
    const facetValues = this.getFacetValues(vendureProduct);

    if (variants.length === 1) {
      return this.createSimpleProduct(
        vendureProduct,
        name,
        description,
        shortDescription,
        slug,
        images,
        variants[0],
        facetValues,
      );
    } else if (variants.length > 1) {
      return this.createVariableProduct(
        vendureProduct,
        name,
        description,
        shortDescription,
        slug,
        images,
        variants,
        facetValues,
      );
    }

    return this.createSimpleProduct(
      vendureProduct,
      name,
      description,
      shortDescription,
      slug,
      images,
      null,
      facetValues,
    );
  }

  private createSimpleProduct(
    vendureProduct: any,
    name: string,
    description: string,
    shortDescription: string,
    slug: string,
    images: Array<{ src: string; name?: string; alt?: string }>,
    variant: any,
    facetValues: WordPressMappedFacetValue[],
  ): MappedWordPressProduct {
    const price = variant ? this.getVariantPrice(variant) : { regular: "0" };
    const stock = variant
      ? this.getVariantStock(variant)
      : { status: "outofstock" as const };
    const outOfStockThreshold = this.getOutOfStockThreshold(variant) ?? 0;
    const mergedName = variant
      ? this.getVariantDisplayName(variant, name)
      : name;
    const mergedImages = variant
      ? this.getVariantImages(variant, images)
      : images;

    const product: WordPressProduct = {
      name: mergedName,
      type: "simple",
      status: vendureProduct.enabled ? "publish" : "draft",
      description,
      short_description: shortDescription,
      sku: variant?.sku || `vendure-${vendureProduct.id}`,
      regular_price: price.regular,
      sale_price: price.sale,
      stock_quantity: stock.quantity,
      low_stock_amount: outOfStockThreshold,
      manage_stock: true,
      stock_status: stock.status,
      images: mergedImages,
      meta_data: [
        {
          key: "_vendure_product_id",
          value: vendureProduct.id.toString(),
        },
        {
          key: "_vendure_slug",
          value: slug,
        },
        {
          key: "_vendure_variant_id",
          value: variant?.id?.toString() || "",
        },
        {
          key: "_vendure_facet_values",
          value: facetValues
            .map((v) => `${v.facetCode}:${v.valueCode}`)
            .join(","),
        },
      ],
    };

    return { product, facetValues };
  }

  private createVariableProduct(
    vendureProduct: any,
    name: string,
    description: string,
    shortDescription: string,
    slug: string,
    images: Array<{ src: string; name?: string; alt?: string }>,
    variants: any[],
    facetValues: WordPressMappedFacetValue[],
  ): MappedWordPressProduct {
    const attributes = this.extractAttributes(variants);
    const mainImage = images[0];

    const product: WordPressProduct = {
      name,
      type: "variable",
      status: vendureProduct.enabled ? "publish" : "draft",
      description,
      short_description: shortDescription,
      images,
      attributes,
      meta_data: [
        {
          key: "_vendure_product_id",
          value: vendureProduct.id.toString(),
        },
        {
          key: "_vendure_slug",
          value: slug,
        },
        {
          key: "_vendure_facet_values",
          value: facetValues
            .map((v) => `${v.facetCode}:${v.valueCode}`)
            .join(","),
        },
      ],
    };

    const variations: WordPressProductVariation[] = variants.map((variant) => {
      const price = this.getVariantPrice(variant);
      const stock = this.getVariantStock(variant);
      const variantAttributes = this.getVariantAttributes(variant);
      const variantName = this.getVariantDisplayName(variant, "");
      const variantImages = this.getVariantImages(variant, images);
      const variationImage = variantImages[0] || mainImage;

      return {
        sku: variant.sku || `vendure-variant-${variant.id}`,
        description: variantName || undefined,
        regular_price: price.regular,
        sale_price: price.sale,
        stock_quantity: stock.quantity,
        low_stock_amount: this.getOutOfStockThreshold(variant),
        manage_stock: true,
        stock_status: stock.status,
        image: variationImage,
        attributes: variantAttributes,
        meta_data: [
          {
            key: "_vendure_variant_id",
            value: variant.id.toString(),
          },
          {
            key: "_vendure_parent_product_id",
            value: vendureProduct.id.toString(),
          },
        ],
      };
    });

    return { product, variations, facetValues };
  }

  private extractAttributes(variants: any[]): WordPressProductAttribute[] {
    const attributeMap = new Map<string, Set<string>>();

    for (const variant of variants) {
      const options = variant.options || [];
      for (const option of options) {
        const groupName = this.getOptionGroupName(option);
        const optionName = this.getOptionValueName(option);

        if (!attributeMap.has(groupName)) {
          attributeMap.set(groupName, new Set());
        }
        attributeMap.get(groupName)!.add(optionName);
      }
    }

    const attributes: WordPressProductAttribute[] = [];
    let position = 0;

    for (const [groupName, optionsSet] of attributeMap.entries()) {
      attributes.push({
        name: groupName,
        position: position++,
        visible: true,
        variation: true,
        options: Array.from(optionsSet),
      });
    }

    if (attributes.length === 0) {
      attributes.push({
        name: "Variant",
        position: 0,
        visible: true,
        variation: true,
        options: variants.map((v, i) => v.name || `Variant ${i + 1}`),
      });
    }

    return attributes;
  }

  private getVariantAttributes(
    variant: any,
  ): Array<{ name: string; option: string }> {
    const attributes: Array<{ name: string; option: string }> = [];
    const options = variant.options || [];

    for (const option of options) {
      const groupName = this.getOptionGroupName(option);
      const optionName = this.getOptionValueName(option);

      attributes.push({
        name: groupName,
        option: optionName,
      });
    }

    if (attributes.length === 0 && variant.name) {
      attributes.push({
        name: "Variant",
        option: variant.name,
      });
    }

    return attributes;
  }

  private getOptionGroupName(option: any): string {
    const translated =
      this.normalizeToString(option?.group?.translations?.[0]?.name) ||
      this.normalizeToString(option?.group?.name);
    if (translated) {
      return translated;
    }
    return (
      this.normalizeToString(option?.group?.code) ||
      this.normalizeToString(option?.groupId) ||
      "Attribute"
    );
  }

  private getOptionValueName(option: any): string {
    const translated =
      this.normalizeToString(option?.translations?.[0]?.name) ||
      this.normalizeToString(option?.name);
    if (translated) {
      return translated;
    }
    return this.normalizeToString(option?.code) || "Option";
  }

  private normalizeToString(value: any): string {
    if (typeof value === "string") {
      return value.trim();
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    if (value && typeof value === "object") {
      // Vendure translatable fields can sometimes resolve to objects.
      if (typeof value.name === "string" && value.name.trim()) {
        return value.name.trim();
      }
      if (typeof value.code === "string" && value.code.trim()) {
        return value.code.trim();
      }
      const firstString = Object.values(value).find(
        (entry) => typeof entry === "string" && entry.trim().length > 0,
      ) as string | undefined;
      if (firstString) {
        return firstString.trim();
      }
    }
    return "";
  }

  private getVariantPrice(variant: any): { regular: string; sale?: string } {
    const syncChannelId = Number((variant as any)?.__syncChannelId);
    const channelPrice = Array.isArray(variant?.productVariantPrices)
      ? variant.productVariantPrices.find(
          (price: any) => Number(price?.channelId) === syncChannelId,
        )
      : null;
    const calculatedPrice =
      typeof channelPrice?.price === "number"
        ? channelPrice.price
        : typeof variant?.listPrice === "number"
          ? variant.listPrice
          : typeof variant?.price === "number"
            ? variant.price
            : 0;
    const regularPrice = (calculatedPrice / 100).toFixed(2);
    return { regular: regularPrice };
  }

  private getVariantStock(variant: any): {
    quantity?: number;
    status: "instock" | "outofstock" | "onbackorder";
  } {
    const stockOnHand = this.getVariantStockOnHand(variant);
    const outOfStockThreshold = this.getOutOfStockThreshold(variant) ?? 0;

    const quantity = stockOnHand ?? 0;

    return {
      quantity: quantity > 0 ? quantity : 0,
      status: quantity > outOfStockThreshold ? "instock" : "outofstock",
    };
  }

  private getProductImages(
    vendureProduct: any,
  ): Array<{ src: string; name?: string; alt?: string }> {
    const images: Array<{ src: string; name?: string; alt?: string }> = [];
    const imageSources = new Set<string>();

    const pushImage = (asset: any) => {
      const src = this.getAssetUrl(asset);
      if (!src || imageSources.has(src)) {
        return;
      }
      imageSources.add(src);
      images.push({
        src,
        name: asset.name,
        alt: asset.name,
      });
    };

    if (vendureProduct.featuredAsset) {
      pushImage(vendureProduct.featuredAsset);
    }

    if (vendureProduct.assets && Array.isArray(vendureProduct.assets)) {
      for (const asset of vendureProduct.assets) {
        if (asset.id !== vendureProduct.featuredAsset?.id) {
          pushImage(asset);
        }
      }
    }

    // Fallback: si el producto no tiene assets, usar featured/assets de las variantes.
    if (images.length === 0 && Array.isArray(vendureProduct.variants)) {
      for (const variant of vendureProduct.variants) {
        pushImage(variant.featuredAsset);
        if (Array.isArray(variant.assets)) {
          for (const asset of variant.assets) {
            pushImage(asset);
          }
        }
      }
    }

    return images;
  }

  private getAssetUrl(asset: any): string | null {
    if (!asset) {
      return null;
    }
    // Priorizar preview porque suele venir con URL de imagen optimizada.
    const candidate =
      (typeof asset.preview === "string" && asset.preview.trim()) ||
      (typeof asset.source === "string" && asset.source.trim()) ||
      "";

    if (!candidate) {
      return null;
    }

    if (this.isAbsoluteHttpUrl(candidate)) {
      return candidate;
    }

    if (this.assetBaseUrl) {
      const normalizedPath = candidate.replace(/^\/+/, "");
      return `${this.assetBaseUrl}/${normalizedPath}`;
    }

    Logger.warn(
      `Asset URL is relative and S3_PUBLIC_URL is not configured. Asset path=${candidate}`,
      ProductMapperService.loggerCtx,
    );
    return null;
  }

  private isAbsoluteHttpUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  private getFacetValues(vendureProduct: any): WordPressMappedFacetValue[] {
    const mapped = new Map<string, WordPressMappedFacetValue>();
    const rawFacetValues = [
      ...(Array.isArray(vendureProduct.facetValues)
        ? vendureProduct.facetValues
        : []),
      ...(vendureProduct.variants || []).flatMap(
        (variant: any) => variant.facetValues || [],
      ),
    ];

    for (const value of rawFacetValues) {
      const facetCode = value?.facet?.code || "";
      const facetName = value?.facet?.name || value?.facet?.code || "Facet";
      const valueCode = value?.code || "";
      const valueName = value?.name || value?.code || "";
      if (!valueCode && !valueName) {
        continue;
      }
      const key = `${facetCode}:${valueCode}:${valueName}`;
      if (!mapped.has(key)) {
        mapped.set(key, {
          facetCode,
          facetName,
          valueCode,
          valueName,
        });
      }
    }

    return Array.from(mapped.values());
  }

  private getVariantDisplayName(variant: any, fallback: string): string {
    const translationName = variant?.translations?.[0]?.name;
    if (
      typeof translationName === "string" &&
      translationName.trim().length > 0
    ) {
      return translationName.trim();
    }
    if (typeof variant?.name === "string" && variant.name.trim().length > 0) {
      return variant.name.trim();
    }
    return fallback;
  }

  private getVariantImages(
    variant: any,
    fallbackImages: Array<{ src: string; name?: string; alt?: string }>,
  ): Array<{ src: string; name?: string; alt?: string }> {
    const variantImages: Array<{ src: string; name?: string; alt?: string }> =
      [];
    const seen = new Set<string>();

    const push = (asset: any) => {
      const src = this.getAssetUrl(asset);
      if (!src || seen.has(src)) {
        return;
      }
      seen.add(src);
      variantImages.push({
        src,
        name: asset?.name,
        alt: asset?.name,
      });
    };

    push(variant?.featuredAsset);
    if (Array.isArray(variant?.assets)) {
      for (const asset of variant.assets) {
        push(asset);
      }
    }

    if (variantImages.length === 0) {
      return fallbackImages;
    }
    return variantImages;
  }

  private getOutOfStockThreshold(variant: any): number | undefined {
    if (!variant) {
      return undefined;
    }
    if (typeof variant.outOfStockThreshold === "number") {
      return variant.outOfStockThreshold;
    }
    return undefined;
  }

  private getVariantStockOnHand(variant: any): number | null {
    if (typeof variant?.stockOnHand === "number") {
      return variant.stockOnHand;
    }
    if (typeof variant?.stockLevel === "number") {
      return variant.stockLevel;
    }
    if (Array.isArray(variant?.stockLevels) && variant.stockLevels.length > 0) {
      return variant.stockLevels.reduce((total: number, level: any) => {
        const value =
          typeof level?.stockOnHand === "number" ? level.stockOnHand : 0;
        return total + value;
      }, 0);
    }
    return null;
  }
}
