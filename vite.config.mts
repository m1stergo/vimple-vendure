import { vendureDashboardPlugin } from "@vendure/dashboard/vite";
import { dirname, join, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { defineConfig } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dashboardApiHost = process.env.VENDURE_API_HOST ?? "http://localhost";
const dashboardApiPort = Number(process.env.VENDURE_API_PORT ?? "3000");

export default defineConfig({
  base: "/dashboard/",
  build: {
    outDir: join(__dirname, "dist/dashboard"),
  },
  plugins: [
    vendureDashboardPlugin({
      // The vendureDashboardPlugin will scan your configuration in order
      // to find any plugins which have dashboard extensions, as well as
      // to introspect the GraphQL schema based on any API extensions
      // and custom fields that are configured.
      vendureConfigPath: pathToFileURL("./src/vendure-config.ts"),
      // Build-time API target for the Dashboard app.
      api: { host: dashboardApiHost, port: dashboardApiPort },
      // When you start the Vite server, your Admin API schema will
      // be introspected and the types will be generated in this location.
      // These types can be used in your dashboard extensions to provide
      // type safety when writing queries and mutations.
      gqlOutputPath: "./src/gql",
    }),
  ],
  resolve: {
    alias: {
      // This allows all plugins to reference a shared set of
      // GraphQL types.
      "@/gql": resolve(__dirname, "./src/gql/graphql.ts"),
    },
  },
});
