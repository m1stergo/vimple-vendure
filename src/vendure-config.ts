import {
  dummyPaymentHandler,
  DefaultJobQueuePlugin,
  DefaultSchedulerPlugin,
  DefaultSearchPlugin,
  LanguageCode,
  UuidIdStrategy,
  VendureConfig,
} from "@vendure/core";
import {
  defaultEmailHandlers,
  EmailPlugin,
  FileBasedTemplateLoader,
} from "@vendure/email-plugin";
import { AssetServerPlugin } from "@vendure/asset-server-plugin";
import { configureCustomS3AssetStorage } from "./custom-s3-storage.strategy";
import { DashboardPlugin } from "@vendure/dashboard/plugin";
import { GraphiqlPlugin } from "@vendure/graphiql-plugin";
import { IntegrationsPlugin } from "./plugins/integrations-plugin";
import {
  ChannelMarkupPriceStrategy,
  VimpleChannelsPlugin,
} from "./plugins/vimple-channels-plugin";
import { PythonHelloAppPlugin } from "./plugins/python-hello-app";
import "dotenv/config";
import path from "path";

const IS_DEV = process.env.APP_ENV !== "production";
const dbSynchronize = process.env.DB_SYNCHRONIZE === "true";
const serverPort = +process.env.PORT || 3000;
const appUrl = process.env.APP_URL?.replace(/\/+$/, "");
const assetUrlPrefix = process.env.S3_PUBLIC_URL
  ? `${process.env.S3_PUBLIC_URL.replace(/\/+$/, "")}/`
  : appUrl
    ? `${appUrl}/assets/`
    : undefined;
const storefrontUrl =
  process.env.STOREFRONT_URL?.replace(/\/+$/, "") || "http://localhost:8080";
const hardenPlugin = (() => {
  try {
    // Optional dependency in environments where package installation is restricted.
    // Install @vendure/harden-plugin to enable this in production.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { HardenPlugin } = require("@vendure/harden-plugin");
    return HardenPlugin.init({
      maxQueryComplexity: 500,
      apiMode: IS_DEV ? "dev" : "prod",
    });
  } catch {
    if (!IS_DEV) {
      console.warn(
        'HardenPlugin not loaded. Install "@vendure/harden-plugin" for production hardening.',
      );
    }
    return undefined;
  }
})();

export const config: VendureConfig = {
  apiOptions: {
    port: serverPort,
    adminApiPath: "admin-api",
    shopApiPath: "shop-api",
    trustProxy: IS_DEV ? false : 1,
    // The following options are useful in development mode,
    // but are best turned off for production for security
    // reasons.
    ...(IS_DEV
      ? {
          adminApiDebug: true,
          shopApiDebug: true,
        }
      : {}),
  },
  authOptions: {
    tokenMethod: ["bearer", "cookie"],
    superadminCredentials: {
      identifier: process.env.SUPERADMIN_USERNAME,
      password: process.env.SUPERADMIN_PASSWORD,
    },
    cookieOptions: {
      secret: process.env.COOKIE_SECRET,
      ...(IS_DEV
        ? {}
        : {
            secure: true,
            sameSite: "lax",
          }),
    },
  },
  dbConnectionOptions: {
    type: "postgres",
    // See the README.md "Migrations" section for an explanation of
    // the `synchronize` and `migrations` options.
    synchronize: dbSynchronize,
    migrations: [path.join(__dirname, "./migrations/*.+(js|ts)")],
    logging: IS_DEV ? ["error", "warn"] : false,
    database: process.env.DB_NAME,
    schema: process.env.DB_SCHEMA,
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
  },
  entityOptions: {
    entityIdStrategy: new UuidIdStrategy(),
  },
  paymentOptions: {
    paymentMethodHandlers: [dummyPaymentHandler],
  },
  catalogOptions: {
    productVariantPriceCalculationStrategy: new ChannelMarkupPriceStrategy(),
  },
  // When adding or altering custom field definitions, the database will
  // need to be updated. See the "Migrations" section in README.md.
  customFields: {
    Product: [
      {
        name: "shortDescription",
        type: "localeText",
        nullable: true,
        ui: {
          component: "rich-text-form-input",
        },
        label: [
          {
            languageCode: LanguageCode.es,
            value: "Descripción corta",
          },
          {
            languageCode: LanguageCode.en,
            value: "Short description",
          },
        ],
      },
    ],
  },
  plugins: [
    ...(hardenPlugin ? [hardenPlugin] : []),
    ...(IS_DEV ? [GraphiqlPlugin.init()] : []),
    AssetServerPlugin.init({
      route: "assets",
      assetUploadDir: path.join(__dirname, "../static/assets"),
      assetUrlPrefix,
      storageStrategyFactory: process.env.S3_BUCKET
        ? configureCustomS3AssetStorage({
            bucket: process.env.S3_BUCKET,
            credentials: {
              accessKeyId: process.env.S3_ACCESS_KEY_ID!,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
            },
            endpoint: process.env.S3_ENDPOINT,
            region: process.env.S3_REGION,
            forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
          })
        : undefined,
    }),
    DefaultSchedulerPlugin.init(),
    DefaultJobQueuePlugin.init({ useDatabaseForBuffer: true }),
    DefaultSearchPlugin.init({ bufferUpdates: false, indexStockStatus: true }),
    IS_DEV
      ? EmailPlugin.init({
          devMode: true,
          outputPath: path.join(__dirname, "../static/email/test-emails"),
          route: "mailbox",
          handlers: defaultEmailHandlers,
          templateLoader: new FileBasedTemplateLoader(
            path.join(__dirname, "../static/email/templates"),
          ),
          globalTemplateVars: {
            fromAddress:
              process.env.EMAIL_FROM_ADDRESS ||
              '"example" <noreply@example.com>',
            verifyEmailAddressUrl: `${storefrontUrl}/verify`,
            passwordResetUrl: `${storefrontUrl}/password-reset`,
            changeEmailAddressUrl: `${storefrontUrl}/verify-email-address-change`,
          },
        })
      : EmailPlugin.init({
          transport: process.env.SMTP_HOST
            ? {
                type: "smtp",
                host: process.env.SMTP_HOST,
                port: Number(process.env.SMTP_PORT || 587),
                secure: process.env.SMTP_SECURE === "true",
                ...(process.env.SMTP_USER && process.env.SMTP_PASSWORD
                  ? {
                      auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASSWORD,
                      },
                    }
                  : {}),
              }
            : { type: "none" },
          handlers: defaultEmailHandlers,
          templateLoader: new FileBasedTemplateLoader(
            path.join(__dirname, "../static/email/templates"),
          ),
          globalTemplateVars: {
            fromAddress:
              process.env.EMAIL_FROM_ADDRESS ||
              '"example" <noreply@example.com>',
            verifyEmailAddressUrl: `${storefrontUrl}/verify`,
            passwordResetUrl: `${storefrontUrl}/password-reset`,
            changeEmailAddressUrl: `${storefrontUrl}/verify-email-address-change`,
          },
        }),
    DashboardPlugin.init({
      route: "dashboard",
      appDir: IS_DEV
        ? path.join(__dirname, "../dist/dashboard")
        : path.join(__dirname, "dashboard"),
    }),
    IntegrationsPlugin,
    VimpleChannelsPlugin,
    PythonHelloAppPlugin,
  ],
};
