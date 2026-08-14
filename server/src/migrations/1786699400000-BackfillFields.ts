import { MigrationInterface, QueryRunner } from "typeorm";

// Backfills the "fields" table from tables.fields (the old jsonb column,
// still present but no longer written to) on databases that had rows
// before FieldEntity existed. No-op on anything migrated from empty (there's
// nothing in tables.fields to copy). See scripts/backfill-fields.sql, which
// this supersedes as an in-app migration.
export class BackfillFields1786699400000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            INSERT INTO "fields" (
                "id", "diagramId", "tableId", "name", "type", "primaryKey", "unique",
                "nullable", "increment", "isArray", "characterMaximumLength",
                "precision", "scale", "default", "collation", "comments", "check",
                "order", "createdAt", "version", "deletedAt"
            )
            SELECT
                elem ->> 'id',
                t."diagramId",
                t."id",
                elem ->> 'name',
                elem -> 'type',
                COALESCE((elem ->> 'primaryKey')::boolean, false),
                COALESCE((elem ->> 'unique')::boolean, false),
                COALESCE((elem ->> 'nullable')::boolean, false),
                (elem ->> 'increment')::boolean,
                (elem ->> 'isArray')::boolean,
                elem ->> 'characterMaximumLength',
                (elem ->> 'precision')::integer,
                (elem ->> 'scale')::integer,
                elem ->> 'default',
                elem ->> 'collation',
                elem ->> 'comments',
                elem ->> 'check',
                (ord - 1)::integer,
                COALESCE((elem ->> 'createdAt')::bigint, 0),
                0,
                NULL
            FROM "tables" t
            CROSS JOIN LATERAL jsonb_array_elements(t."fields") WITH ORDINALITY AS arr(elem, ord)
            WHERE t."fields" IS NOT NULL
            ON CONFLICT ("id") DO NOTHING
        `);
    }

    public async down(): Promise<void> {
        // Not reversed: rows backfilled here are indistinguishable from
        // rows the app has since written to "fields" via normal use.
    }

}
