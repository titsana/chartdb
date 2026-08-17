import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds optimistic-concurrency versioning to diagrams, matching every other
// collaborative entity (tables, fields, relationships, ...) — updateDiagram
// (rename, change databaseType/databaseEdition) previously had no version
// column to guard against, so concurrent diagram-level edits silently
// last-write-won with no conflict, no correction. See collaboration-context's
// version tracking for how the other entities already use this column.
export class AddDiagramVersion1786700000000 implements MigrationInterface {
    name = 'AddDiagramVersion1786700000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "diagrams" ADD "version" integer NOT NULL DEFAULT '0'`
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "diagrams" DROP COLUMN "version"`);
    }
}
