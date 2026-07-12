import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('diagrams')
export class DiagramEntity {
    @PrimaryColumn('varchar')
    id: string;

    @Column('varchar')
    name: string;

    @Column('varchar')
    databaseType: string;

    @Column('varchar', { nullable: true })
    databaseEdition?: string | null;

    @Column('timestamptz')
    createdAt: Date;

    @Column('timestamptz')
    updatedAt: Date;
}
