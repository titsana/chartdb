import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('groups')
export class GroupEntity {
    @PrimaryColumn('varchar')
    id: string;

    @Column('varchar')
    name: string;

    @Column('timestamptz')
    createdAt: Date;

    @Column('timestamptz')
    updatedAt: Date;

    @Column('timestamptz', { nullable: true })
    deletedAt?: Date | null;
}
