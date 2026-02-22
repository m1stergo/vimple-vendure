import { LanguageCode, PluginCommonModule, VendurePlugin } from "@vendure/core";
import { ChannelProductsAdminResolver } from "./api/channel-products/channel-products.resolver";
import { SeleccionarProductosAdminResolver } from "./api/seleccionar-productos/seleccionar-productos.resolver";
import { adminApiExtensions } from "./api/api-extensions";
import { ChannelMarkupRepriceService } from "./services/channel-markup-reprice.service";

@VendurePlugin({
  imports: [PluginCommonModule],
  compatibility: "^3.0.0",
  adminApiExtensions: {
    schema: adminApiExtensions,
    resolvers: [
      ChannelProductsAdminResolver,
      SeleccionarProductosAdminResolver,
    ],
  },
  providers: [ChannelMarkupRepriceService],
  configuration: (config) => {
    config.customFields.Channel ??= [];

    const hasMarkupField = config.customFields.Channel.some(
      (field) => field.name === "markup",
    );

    if (!hasMarkupField) {
      config.customFields.Channel.push({
        name: "markup",
        type: "float",
        nullable: true,
        defaultValue: 0,
        label: [
          { languageCode: LanguageCode.es, value: "Markup (%)" },
          { languageCode: LanguageCode.en, value: "Markup (%)" },
        ],
        description: [
          {
            languageCode: LanguageCode.es,
            value: "Porcentaje de costo adicional para este canal",
          },
          {
            languageCode: LanguageCode.en,
            value: "Additional cost percentage for this channel",
          },
        ],
      });
    }

    return config;
  },
  dashboard: "./dashboard/index.tsx",
})
export class VimpleChannelsPlugin {}
