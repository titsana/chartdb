import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity('areas')
export class AreaEntity {
    @PrimaryColumn('varchar')
    id: string;

    @Index()
    @Column('varchar')
    diagramId: string;

    @Column('varchar')
    name: string;

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
}
