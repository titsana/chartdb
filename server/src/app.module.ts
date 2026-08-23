import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { CollabModule } from './collab/collab.module';
import { DiagramsModule } from './diagrams/diagrams.module';
import { DiagramGroupsModule } from './diagram-groups/diagram-groups.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';
import { ConfigJsController } from './config-js.controller';

@Module({
    imports: [
        AuthModule,
        CollabModule,
        DiagramsModule,
        DiagramGroupsModule,
        // Single-container deploy (docs/design/realtime-collaboration.md
        // §7): serves the client's built `dist/` (copied to `public/`
        // alongside this compiled server — see Dockerfile.combined) so
        // client+API share one origin/domain. Registers directly on the
        // underlying Express app (confirmed by reading
        // @nestjs/serve-static's ExpressLoader source before relying on
        // it) — bypasses Nest's guard pipeline entirely, same as
        // ws-upgrade.service.ts's raw upgrade handler, so this needs no
        // @Public() and is unaffected by AUTH_MODE either way. `exclude`
        // stops its catch-all SPA-fallback route from swallowing real API
        // requests that don't match a static file — process.cwd() (not
        // __dirname) matches this repo's own integration-test convention
        // for "the server package's own directory", correct under both
        // `tsx watch` (dev) and the compiled dist/ build.
        ServeStaticModule.forRoot({
            rootPath: join(process.cwd(), 'public'),
            exclude: [
                '/health/{*splat}',
                '/diagrams/{*splat}',
                '/diagram-groups/{*splat}',
                '/config.js',
            ],
        }),
    ],
    controllers: [HealthController, ConfigJsController],
})
export class AppModule {}
