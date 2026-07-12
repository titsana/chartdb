import { Entity, PrimaryColumn, Column } from 'typeorm';

// ponytail: single-row table (id fixed to 1), matches the client's single ChartDBConfig record
@Entity('config')
export class ConfigEntity {
    @PrimaryColumn('int')
    id: number;

    @Column('varchar', { nullable: true })
    defaultDiagramId?: string;

    @Column('jsonb', { nullable: true })
    exportActions?: string[] | null;
}
