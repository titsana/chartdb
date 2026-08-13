import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity('custom_types')
export class CustomTypeEntity {
    @PrimaryColumn('varchar')
    id: string;

    @Index()
    @Column('varchar')
    diagramId: string;

    @Column('varchar', { nullable: true })
    schema?: string | null;

    @Column('varchar')
    name: string;

    @Column('varchar')
    kind: 'enum' | 'composite';

    @Column('jsonb', { nullable: true })
    values?: string[] | null;

    @Column('jsonb', { nullable: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fields?: any[] | null;

    @Column('int', { nullable: true })
    order?: number | null;

    @Column('int', { default: 0 })
    version: number;

    @Column('timestamptz', { nullable: true })
    deletedAt?: Date | null;
}
