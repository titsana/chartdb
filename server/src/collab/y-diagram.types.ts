/**
 * Structural stand-ins for the client's `@/lib/domain/*` types, so the
 * generated `y-diagram.ts` copy compiles without dragging zod schemas and
 * the client's utils into the server build. ponytail: kept loose on
 * purpose — y-diagram only reads ids/order/nested collections; the MCP
 * tools' zod schemas are where real input validation lives.
 */
export interface DataType {
    id: string;
    name: string;
}

export interface DBField {
    id: string;
    name: string;
    type: DataType;
    primaryKey: boolean;
    unique: boolean;
    nullable: boolean;
    createdAt: number;
    [key: string]: unknown;
}

export interface DBIndex {
    id: string;
    name: string;
    unique: boolean;
    fieldIds: string[];
    createdAt: number;
    [key: string]: unknown;
}

export interface DBCheckConstraint {
    id: string;
    [key: string]: unknown;
}

export interface DBTable {
    id: string;
    name: string;
    schema?: string | null;
    x: number;
    y: number;
    fields: DBField[];
    indexes: DBIndex[];
    checkConstraints?: DBCheckConstraint[] | null;
    color: string;
    isView: boolean;
    createdAt: number;
    order?: number | null;
    [key: string]: unknown;
}

interface Entity {
    id: string;
    order?: number | null;
    [key: string]: unknown;
}

export type DBRelationship = Entity;
export type DBDependency = Entity;
export type Area = Entity;
export type DBCustomType = Entity;
export type Note = Entity;

export interface Diagram {
    id: string;
    name: string;
    databaseType: string;
    databaseEdition?: string | null;
    tables?: DBTable[];
    relationships?: DBRelationship[];
    dependencies?: DBDependency[];
    areas?: Area[];
    customTypes?: DBCustomType[];
    notes?: Note[];
    createdAt: Date;
    updatedAt: Date;
}
