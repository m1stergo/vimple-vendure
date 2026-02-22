import gql from 'graphql-tag';

export const adminApiExtensions = gql`
    extend type Query {
        productsWithChannelStatus(options: ProductListOptions): ProductsWithChannelStatus!
    }

    extend type Mutation {
        bulkAssignProductsToChannel(productIds: [ID!]!): [Product!]!
        bulkRemoveProductsFromChannel(productIds: [ID!]!): [Product!]!
    }

    type ProductsWithChannelStatus {
        items: [ProductWithChannelStatus!]!
        totalItems: Int!
    }

    type ProductWithChannelStatus {
        id: ID!
        name: String!
        slug: String!
        enabled: Boolean!
        featuredAsset: Asset
        isAssignedToChannel: Boolean!
    }
`;
