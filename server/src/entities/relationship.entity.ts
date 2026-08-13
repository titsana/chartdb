import { Entity, PrimaryColumn, Column, Index } from 'typeorm';
import { numericTransformer } from './transformers';

@Entity('relationships')
export class RelationshipEntity {
    @PrimaryColumn('varchar')
    id: string;

    @Index()
    @Column('varchar')
    diagramId: string;

    @Column('varchar')
    name: string;

    @Column('varchar', { nullable: true })
    sourceSchema?: string | null;

    @Column('varchar')
    sourceTableId: string;

    @Column('varchar', { nullable: true })
    targetSchema?: string | null;

    @Column('varchar')
    targetTableId: string;

    @Column('varchar')
    sourceFieldId: string;

    @Column('varchar')
    targetFieldId: string;

    @Column('varchar')
    sourceCardinality: 'one' | 'many';

    @Column('varchar')
    targetCardinality: 'one' | 'many';

    @Column('bigint', { transformer: numericTransformer })
    createdAt: number;

    @Column('int', { default: 0 })
    version: number;

    @Column('timestamptz', { nullable: true })
    deletedAt?: Date | null;
}
