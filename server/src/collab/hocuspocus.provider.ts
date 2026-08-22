import { Hocuspocus } from '@hocuspocus/server';
import type { Pool } from 'pg';
import { createPersistenceExtension } from './persistence-extension';

/** One Hocuspocus instance for the whole process — it multiplexes every
 * diagram's room internally (see durable-log.ts's header comment on why
 * the WebSocket URL itself doesn't need to carry the diagramId: Hocuspocus
 * reads it from each wire message instead). */
export function createHocuspocus(pool: Pool): Hocuspocus {
    return new Hocuspocus({
        extensions: [createPersistenceExtension(pool)],
    });
}
