import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity('notes')
@Index(['diagramId', 'parentAreaId'])
export class NoteEntity {
    @PrimaryColumn('varchar')
    id: string;

    @Index()
    @Column('varchar')
    diagramId: string;

    @Column('text')
    content: string;

    @Column('double precision')
    x: number;

    @Column('double precision')
    y: number;

    @Column('double precision')
    width: number;

    @Column('double precision')
    height: number;

    @Column('varchar')
    color: string;

    @Column('int', { nullable: true })
    order?: number;

    @Column('varchar', { nullable: true })
    parentAreaId?: string | null;

    @Column('int', { default: 0 })
    version: number;

    @Column('timestamptz', { nullable: true })
    deletedAt?: Date | null;
}
