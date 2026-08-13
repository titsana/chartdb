import { Entity, PrimaryColumn, Column, Index } from 'typeorm';
import { numericTransformer } from './transformers';

@Entity('tables')
@Index(['diagramId', 'parentAreaId'])
export class TableEntity {
    @PrimaryColumn('varchar')
    id: string;

    @Index()
    @Column('varchar')
    diagramId: string;

    @Column('varchar')
    name: string;

    @Column('varchar', { nullable: true })
    schema?: string | null;

    @Column('double precision')
    x: number;

    @Column('double precision')
    y: number;

    @Column('jsonb')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fields: any[];

    @Column('jsonb')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    indexes: any[];

    @Column('jsonb', { nullable: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    checkConstraints?: any[] | null;

    @Column('varchar')
    color: string;

    @Column('boolean')
    isView: boolean;

    @Column('boolean', { nullable: true })
    isMaterializedView?: boolean | null;

    @Column('bigint', { transformer: numericTransformer })
    createdAt: number;

    @Column('double precision', { nullable: true })
    width?: number | null;

    @Column('text', { nullable: true })
    comments?: string | null;

    @Column('int', { nullable: true })
    order?: number | null;

    @Column('boolean', { nullable: true })
    expanded?: boolean | null;

    @Column('varchar', { nullable: true })
    parentAreaId?: string | null;

    @Column('int', { default: 0 })
    version: number;

    @Column('timestamptz', { nullable: true })
    deletedAt?: Date | null;
}
