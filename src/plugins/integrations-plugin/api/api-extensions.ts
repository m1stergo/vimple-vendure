import gql from 'graphql-tag';

export const adminApiExtensions = gql`
    type Integration {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        name: String!
        type: String!
        config: JSON!
        enabled: Boolean!
        enabledFeatures: [String!]!
    }

    type IntegrationList {
        items: [Integration!]!
        totalItems: Int!
    }

    type IntegrationFeature {
        id: String!
        name: String!
        description: String!
        icon: String!
    }

    type IntegrationTypeDefinition {
        id: String!
        name: String!
        description: String!
        icon: String!
        features: [IntegrationFeature!]!
    }

    input CreateIntegrationInput {
        name: String!
        type: String!
        config: String!
        enabledFeatures: [String!]
    }

    input UpdateIntegrationInput {
        name: String
        config: String
        enabled: Boolean
        enabledFeatures: [String!]
    }

    extend type Query {
        integrations(options: IntegrationListOptions): IntegrationList!
        integration(id: ID!): Integration
    }

    extend type Mutation {
        createIntegration(input: CreateIntegrationInput!): Integration!
        updateIntegration(id: ID!, input: UpdateIntegrationInput!): Integration
        deleteIntegration(id: ID!): DeletionResponse!
    }

    input IntegrationListOptions {
        skip: Int
        take: Int
        sort: IntegrationSortParameter
        filter: IntegrationFilterParameter
    }

    input IntegrationSortParameter {
        id: SortOrder
        createdAt: SortOrder
        updatedAt: SortOrder
        name: SortOrder
        type: SortOrder
    }

    input IntegrationFilterParameter {
        id: IDOperators
        createdAt: DateOperators
        updatedAt: DateOperators
        name: StringOperators
        type: StringOperators
        enabled: BooleanOperators
    }
`;
