import { DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

@Entity()
@Index(['vendureProductId', 'integrationId'], { unique: true })
export class ProductIntegrationMapping extends VendureEntity {
    constructor(input?: DeepPartial<ProductIntegrationMapping>) {
        super(input);
    }

    @Index()
    @Column()
    vendureProductId: number;

    @Index()
    @Column()
    integrationId: number;

    @Column()
    externalProductId: string;

    @Column({ nullable: true })
    externalSku: string;
}
