import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('diagram_filters')
export class DiagramFilterEntity {
    @PrimaryColumn('varchar')
    diagramId: string;

    // Personal scope — was diagramId-only, so one person's view filter
    // (hide these schemas/tables) silently applied to everyone else viewing
    // the same diagram. 'local' when Azure AD isn't configured (see
    // ConditionalAzureAdGuard): there's no real per-user identity in that
    // mode, so it degrades to a single shared bucket, matching today's
    // no-auth behavior rather than a real personal filter.
    @PrimaryColumn('varchar')
    userId: string;

    @Column('jsonb', { nullable: true })
    schemaIds?: string[] | null;

    @Column('jsonb', { nullable: true })
    tableIds?: string[] | null;
}
