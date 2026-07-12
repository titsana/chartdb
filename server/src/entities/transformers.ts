import type { ValueTransformer } from 'typeorm';

// ponytail: pg driver returns bigint/numeric as string, domain expects number
export const numericTransformer: ValueTransformer = {
    to: (value?: number | null) => value,
    from: (value?: string | null) =>
        value === null || value === undefined ? value : Number(value),
};
