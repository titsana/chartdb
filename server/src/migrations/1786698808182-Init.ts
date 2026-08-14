import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1786698808182 implements MigrationInterface {
    name = 'Init1786698808182'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "tables" ("id" character varying NOT NULL, "diagramId" character varying NOT NULL, "name" character varying NOT NULL, "schema" character varying, "x" double precision NOT NULL, "y" double precision NOT NULL, "fields" jsonb NOT NULL, "indexes" jsonb NOT NULL, "checkConstraints" jsonb, "color" character varying NOT NULL, "isView" boolean NOT NULL, "isMaterializedView" boolean, "createdAt" bigint NOT NULL, "width" double precision, "comments" text, "order" integer, "expanded" boolean, "parentAreaId" character varying, "version" integer NOT NULL DEFAULT '0', "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_7cf2aca7af9550742f855d4eb69" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_291d5f61192e8fe60af400bbd0" ON "tables" ("diagramId") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_6c6a0b8b65eea62a5bf9c90748" ON "tables" ("diagramId", "parentAreaId") `);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "notes" ("id" character varying NOT NULL, "diagramId" character varying NOT NULL, "content" text NOT NULL, "x" double precision NOT NULL, "y" double precision NOT NULL, "width" double precision NOT NULL, "height" double precision NOT NULL, "color" character varying NOT NULL, "order" integer, "parentAreaId" character varying, "version" integer NOT NULL DEFAULT '0', "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_af6206538ea96c4e77e9f400c3d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_44ee38e737412036026009d3e1" ON "notes" ("diagramId") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_c69c13ddb53ea0a8a4610c1acd" ON "notes" ("diagramId", "parentAreaId") `);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "groups" ("id" character varying NOT NULL, "name" character varying NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_659d1483316afb28afd3a90646e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "diagrams" ("id" character varying NOT NULL, "name" character varying NOT NULL, "databaseType" character varying NOT NULL, "databaseEdition" character varying, "groupId" character varying, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_81f832a385d660caf0bf53cb6c9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "relationships" ("id" character varying NOT NULL, "diagramId" character varying NOT NULL, "name" character varying NOT NULL, "sourceSchema" character varying, "sourceTableId" character varying NOT NULL, "targetSchema" character varying, "targetTableId" character varying NOT NULL, "sourceFieldId" character varying NOT NULL, "targetFieldId" character varying NOT NULL, "sourceCardinality" character varying NOT NULL, "targetCardinality" character varying NOT NULL, "createdAt" bigint NOT NULL, "version" integer NOT NULL DEFAULT '0', "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_ba20e2f5cf487408e08e4dcecaf" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_21453c6dfec2d345a33127bed8" ON "relationships" ("diagramId") `);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "diagram_filters" ("diagramId" character varying NOT NULL, "schemaIds" jsonb, "tableIds" jsonb, CONSTRAINT "PK_59abbe187a87d552920a6a05f75" PRIMARY KEY ("diagramId"))`);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "dependencies" ("id" character varying NOT NULL, "diagramId" character varying NOT NULL, "schema" character varying, "tableId" character varying NOT NULL, "dependentSchema" character varying, "dependentTableId" character varying NOT NULL, "createdAt" bigint NOT NULL, "version" integer NOT NULL DEFAULT '0', "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_9f1f03f8207f8df418ae3eca645" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_d28d61a27a8c1365affbce18d6" ON "dependencies" ("diagramId") `);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "custom_types" ("id" character varying NOT NULL, "diagramId" character varying NOT NULL, "schema" character varying, "name" character varying NOT NULL, "kind" character varying NOT NULL, "values" jsonb, "fields" jsonb, "order" integer, "version" integer NOT NULL DEFAULT '0', "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_e48ef0d7fe4c8b3edcb11a5dfc9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_abafb6f5b7f1f20d35db31fc73" ON "custom_types" ("diagramId") `);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "config" ("id" integer NOT NULL, "defaultDiagramId" character varying, "exportActions" jsonb, CONSTRAINT "PK_d0ee79a681413d50b0a4f98cf7b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "areas" ("id" character varying NOT NULL, "diagramId" character varying NOT NULL, "name" character varying NOT NULL, "x" double precision NOT NULL, "y" double precision NOT NULL, "width" double precision NOT NULL, "height" double precision NOT NULL, "color" character varying NOT NULL, "order" integer, "version" integer NOT NULL DEFAULT '0', "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_5110493f6342f34c978c084d0d6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_0e8bed2b97070ab4f6c43fe787" ON "areas" ("diagramId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_0e8bed2b97070ab4f6c43fe787"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "areas"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "config"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_abafb6f5b7f1f20d35db31fc73"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "custom_types"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_d28d61a27a8c1365affbce18d6"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "dependencies"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "diagram_filters"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_21453c6dfec2d345a33127bed8"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "relationships"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "diagrams"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "groups"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_c69c13ddb53ea0a8a4610c1acd"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_44ee38e737412036026009d3e1"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "notes"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_6c6a0b8b65eea62a5bf9c90748"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_291d5f61192e8fe60af400bbd0"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "tables"`);
    }

}
