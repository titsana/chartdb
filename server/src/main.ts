import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadConfig } from './config';

async function bootstrap(): Promise<void> {
    const config = loadConfig();
    const app = await NestFactory.create(AppModule);
    // Phase 4.5: the new /diagrams REST endpoints are called cross-origin
    // from the browser (localhost:5173 -> this server's port), unlike the
    // WebSocket upgrade, which has its own origin check in
    // ws-upgrade.service.ts. Reuses the same allowlist/policy: empty means
    // allow every origin (local dev with no .env set), matching
    // isOriginAllowed's "empty allowlist" behavior for WS.
    app.enableCors({
        origin:
            config.originAllowlist.length === 0
                ? true
                : config.originAllowlist,
    });
    await app.listen(config.port);
    // eslint-disable-next-line no-console
    console.log(`chartdb-collab-server listening on :${config.port}`);
}

bootstrap();
