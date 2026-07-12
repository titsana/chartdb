import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('diagram_filters')
export class DiagramFilterEntity {
    @PrimaryColumn('varchar')
    diagramId: string;

    @Column('jsonb', { nullable: true })
    schemaIds?: string[] | null;

    @Column('jsonb', { nullable: true })
    tableIds?: string[] | null;
}
