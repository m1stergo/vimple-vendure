import { bootstrap, RequestContext, LanguageCode } from '@vendure/core';
import { config } from './vendure-config';

async function populateData() {
    console.log('Starting Vendure...');
    const app = await bootstrap(config);
    
    console.log('Getting services...');
    const productService = app.get('ProductService');
    const channelService = app.get('ChannelService');
    const userService = app.get('UserService');
    
    console.log('Creating admin context...');
    // Get the default channel
    const channels = await channelService.findAll(RequestContext.empty());
    const defaultChannel = channels.items[0];
    
    // Get superadmin user
    const superAdmin = await userService.getUserByEmailAddress(
        RequestContext.empty(),
        process.env.SUPERADMIN_USERNAME || 'superadmin'
    );
    
    if (!superAdmin) {
        throw new Error('Superadmin user not found');
    }
    
    // Create context
    const ctx = new RequestContext({
        apiType: 'admin',
        isAuthorized: true,
        authorizedAsOwnerOnly: false,
        channel: defaultChannel,
        languageCode: LanguageCode.en,
        session: {
            id: 'populate-session',
            token: 'populate-token',
            expires: new Date(Date.now() + 1000 * 60 * 60),
            cacheExpiry: 1000 * 60 * 60,
            user: {
                id: superAdmin.id,
                identifier: superAdmin.identifier,
                verified: true,
                channelPermissions: [],
            },
        } as any,
    });
    
    console.log('Populating products...');
    
    // Create some sample products
    const products = [
        {
            translations: [
                {
                    languageCode: 'en',
                    name: 'Laptop',
                    slug: 'laptop',
                    description: 'High-performance laptop',
                },
            ],
            facetValueIds: [],
        },
        {
            translations: [
                {
                    languageCode: 'en',
                    name: 'Mouse',
                    slug: 'mouse',
                    description: 'Wireless mouse',
                },
            ],
            facetValueIds: [],
        },
        {
            translations: [
                {
                    languageCode: 'en',
                    name: 'Keyboard',
                    slug: 'keyboard',
                    description: 'Mechanical keyboard',
                },
            ],
            facetValueIds: [],
        },
    ];
    
    for (const productData of products) {
        try {
            const product = await productService.create(ctx, productData);
            console.log(`Created product: ${product.name}`);
            
            // Create a variant for each product
            await productService.createVariants(ctx, product.id, [
                {
                    sku: `${product.slug}-001`,
                    price: Math.floor(Math.random() * 10000) + 1000,
                    stockOnHand: 100,
                    translations: [
                        {
                            languageCode: 'en',
                            name: product.name,
                        },
                    ],
                },
            ]);
        } catch (error) {
            console.error(`Error creating product:`, error);
        }
    }
    
    console.log('Data population complete!');
    await app.close();
}

populateData()
    .then(() => {
        console.log('Done!');
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
