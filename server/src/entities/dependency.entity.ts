import { Entity, PrimaryColumn, Column, Index } from 'typeorm';
import { numericTransformer } from './transformers';

@Entity('dependencies')
export class DependencyEntity {
    @PrimaryColumn('varchar')
    id: string;

    @Index()
    @Column('varchar')
    diagramId: string;

    @Column('varchar', { nullable: true })
    schema?: string | null;

    @Column('varchar')
    tableId: string;

    @Column('varchar', { nullable: true })
    dependentSchema?: string | null;

    @Column('varchar')
    dependentTableId: string;

    @Column('bigint', { transformer: numericTransformer })
    createdAt: number;

    @Column('int', { default: 0 })
    version: number;

    @Column('timestamptz', { nullable: true })
    deletedAt?: Date | null;
}
