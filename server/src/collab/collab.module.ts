import { Module } from '@nestjs/common';
import { loadConfig } from '../config';
import { createPool } from '../db/pool';
import { createHocuspocus } from './hocuspocus.provider';
import { COLLAB_CONFIG, HOCUSPOCUS, PG_POOL } from './tokens';
import { WsUpgradeService } from './ws-upgrade.service';

@Module({
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
            useFactory: (pool: ReturnType<typeof createPool>) =>
                createHocuspocus(pool),
            inject: [PG_POOL],
        },
        WsUpgradeService,
    ],
})
export class CollabModule {}
