import gql from 'graphql-tag';

export const adminApiExtensions = gql`
    type ChannelProductsList {
        items: [Product!]!
        totalItems: Int!
    }

    extend type Query {
        productsByChannel(channelId: ID!, options: ProductListOptions): ProductList!
        channelsWithProductCount: [ChannelWithProductCount!]!
    }

    extend type Mutation {
        addProductToChannel(productId: ID!, channelId: ID!): Product!
        removeProductFromChannel(productId: ID!, channelId: ID!): Product!
    }

    type ChannelWithProductCount {
        id: ID!
        code: String!
        token: String!
        defaultLanguageCode: String!
        currencyCode: String!
        pricesIncludeTax: Boolean!
        productCount: Int!
    }
`;
