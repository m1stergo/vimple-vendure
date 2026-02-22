import { DeepPartial, VendureEntity, ID } from '@vendure/core';
import { Column, Entity } from 'typeorm';
import { IntegrationFeatureId } from '../integration-features';

export type IntegrationType = 'mercadolibre' | 'wordpress';

@Entity()
export class Integration extends VendureEntity {
    constructor(input?: DeepPartial<Integration>) {
        super(input);
    }

    @Column()
    name: string;

    @Column()
    type: IntegrationType;

    @Column('simple-json')
    config: Record<string, string>;

    @Column({ default: true })
    enabled: boolean;

    /**
     * Lista de funcionalidades activas para esta integración.
     * Solo se ejecutarán los handlers de las funcionalidades que estén en esta lista.
     */
    @Column('simple-json', { default: '[]' })
    enabledFeatures: IntegrationFeatureId[];
}
