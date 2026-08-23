import { Module } from '@nestjs/common';
import { loadConfig } from '../config';
import { createPool } from '../db/pool';
import { createHocuspocus } from './hocuspocus.provider';
import { COLLAB_CONFIG, HOCUSPOCUS, PG_POOL } from './tokens';
import { WsUpgradeService } from './ws-upgrade.service';
import { AuthModule } from '../auth/auth.module';
import { ENTRA_AUTH } from '../auth/tokens';
import type { EntraAuthState } from '../auth/entra-auth-state';

@Module({
    imports: [AuthModule],
    providers: [
        { provide: COLLAB_CONFIG, useFactory: () => loadConfig() },
        {
            provide: PG_POOL,
            useFactory: (config: ReturnType<typeof loadConfig>) =>
                createPool(config.databaseUrl),
            inject: [COLLAB_CONFIG],
        },
        {
            provide: HOCUSPOCUS,
            useFactory: (pool: ReturnType<typeof createPool>, auth: EntraAuthState) =>
                createHocuspocus(pool, auth),
            inject: [PG_POOL, ENTRA_AUTH],
        },
        WsUpgradeService,
    ],
    // Phase 4.5: DiagramsModule needs PG_POOL (metadata CRUD) and
    // HOCUSPOCUS (evicting a room's live connections on delete) — both
    // already constructed here, no reason to build a second Pool/Hocuspocus
    // instance just to keep them module-private.
    exports: [PG_POOL, HOCUSPOCUS, COLLAB_CONFIG],
})
export class CollabModule {}
