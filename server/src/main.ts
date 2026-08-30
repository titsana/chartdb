import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadConfig } from './config';

async function bootstrap(): Promise<void> {
    const config = loadConfig();
    const app = await NestFactory.create(AppModule);
    // The client's own router has a page at /diagrams/:id (editor-page),
    // which collides 1:1 with this REST API's GET /diagrams/:id — a
    // browser refresh on that page URL used to hit this controller
    // instead of getting index.html back (SPA-fallback's exclude list in
    // app.module.ts has to exclude API paths from the fallback, and had
    // no way to tell "browser navigating to this URL" apart from "the
    // SPA's own fetch() call to the same URL"). Namespacing every REST
    // route under /api removes the collision permanently, including for
    // any client route added later. health/config.js are excluded: they
    // predate this prefix, have no client-route counterpart, and
    // health.controller.ts/config-js.controller.ts + their tests already
    // hardcode the unprefixed path.
    app.setGlobalPrefix('api', { exclude: ['health', 'config.js'] });
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
