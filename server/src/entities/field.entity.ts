import { Entity, PrimaryColumn, Column, Index } from 'typeorm';
import { numericTransformer } from './transformers';

@Entity('fields')
export class FieldEntity {
    @PrimaryColumn('varchar')
    id: string;

    @Index()
    @Column('varchar')
    diagramId: string;

    @Index()
    @Column('varchar')
    tableId: string;

    @Column('varchar')
    name: string;

    // DBField.type is a DataType object ({id, name, ...}), same shape it had
    // as an element of the table's old `fields` jsonb array.
    @Column('jsonb')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type: any;

    @Column('boolean')
    primaryKey: boolean;

    @Column('boolean')
    unique: boolean;

    @Column('boolean')
    nullable: boolean;

    @Column('boolean', { nullable: true })
    increment?: boolean | null;

    @Column('boolean', { nullable: true })
    isArray?: boolean | null;

    @Column('varchar', { nullable: true })
    characterMaximumLength?: string | null;

    @Column('int', { nullable: true })
    precision?: number | null;

    @Column('int', { nullable: true })
    scale?: number | null;

    @Column('text', { nullable: true })
    default?: string | null;

    @Column('varchar', { nullable: true })
    collation?: string | null;

    @Column('text', { nullable: true })
    comments?: string | null;

    @Column('text', { nullable: true })
    check?: string | null;

    @Column('int')
    order: number;

    @Column('bigint', { transformer: numericTransformer })
    createdAt: number;

    @Column('int', { default: 0 })
    version: number;

    @Column('timestamptz', { nullable: true })
    deletedAt?: Date | null;
}
