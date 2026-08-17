import { MigrationInterface, QueryRunner } from 'typeorm';

// diagram_filters was keyed by diagramId alone — one person's view filter
// (hidden schemas/tables) silently applied to every other viewer of the
// same diagram. Rescopes it per-user: existing rows backfill to 'local'
// (the shared bucket used when Azure AD isn't configured — see
// ConditionalAzureAdGuard), so today's single-bucket behavior is preserved
// for anyone upgrading without Azure AD, while Azure AD deployments start
// keying new filter writes by the user's oid claim (see
// storage.controller.ts).
export class DiagramFilterPersonalScope1786700100000
    implements MigrationInterface
{
    name = 'DiagramFilterPersonalScope1786700100000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "diagram_filters" ADD "userId" character varying NOT NULL DEFAULT 'local'`
        );
        await queryRunner.query(
            `ALTER TABLE "diagram_filters" DROP CONSTRAINT "PK_59abbe187a87d552920a6a05f75"`
        );
        await queryRunner.query(
            `ALTER TABLE "diagram_filters" ADD CONSTRAINT "PK_diagram_filters_diagramId_userId" PRIMARY KEY ("diagramId", "userId")`
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Note: if more than one user has saved a filter for the same
        // diagram since the up-migration, this fails on the duplicate
        // diagramId — that's an inherent limitation of reverting a
        // scope-widening change, not something to silently paper over.
        await queryRunner.query(
            `ALTER TABLE "diagram_filters" DROP CONSTRAINT "PK_diagram_filters_diagramId_userId"`
        );
        await queryRunner.query(
            `ALTER TABLE "diagram_filters" ADD CONSTRAINT "PK_59abbe187a87d552920a6a05f75" PRIMARY KEY ("diagramId")`
        );
        await queryRunner.query(
            `ALTER TABLE "diagram_filters" DROP COLUMN "userId"`
        );
    }
}
