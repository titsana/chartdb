import { MigrationInterface, QueryRunner } from "typeorm";

export class Auto1786699329771 implements MigrationInterface {
    name = 'Auto1786699329771'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "fields" ("id" character varying NOT NULL, "diagramId" character varying NOT NULL, "tableId" character varying NOT NULL, "name" character varying NOT NULL, "type" jsonb NOT NULL, "primaryKey" boolean NOT NULL, "unique" boolean NOT NULL, "nullable" boolean NOT NULL, "increment" boolean, "isArray" boolean, "characterMaximumLength" character varying, "precision" integer, "scale" integer, "default" text, "collation" character varying, "comments" text, "check" text, "order" integer NOT NULL, "createdAt" bigint NOT NULL, "version" integer NOT NULL DEFAULT '0', "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_ee7a215c6cd77a59e2cb3b59d41" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_736e063a5f905c9a129e4296cb" ON "fields" ("diagramId") `);
        await queryRunner.query(`CREATE INDEX "IDX_99d885c4072ee5c80fa700f3f3" ON "fields" ("tableId") `);
        await queryRunner.query(`ALTER TABLE "tables" ALTER COLUMN "fields" SET DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "tables" ALTER COLUMN "indexes" SET DEFAULT '[]'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tables" ALTER COLUMN "indexes" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "tables" ALTER COLUMN "fields" DROP DEFAULT`);
        await queryRunner.query(`DROP INDEX "public"."IDX_99d885c4072ee5c80fa700f3f3"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_736e063a5f905c9a129e4296cb"`);
        await queryRunner.query(`DROP TABLE "fields"`);
    }

}
