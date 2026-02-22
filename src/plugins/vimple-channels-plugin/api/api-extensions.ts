import gql from "graphql-tag";
import { adminApiExtensions as channelProductsAdminApiExtensions } from "./channel-products/api-extensions";
import { adminApiExtensions as seleccionarProductosAdminApiExtensions } from "./seleccionar-productos/api-extensions";

export const adminApiExtensions = gql`
  ${channelProductsAdminApiExtensions}
  ${seleccionarProductosAdminApiExtensions}
`;
