import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { json } from 'express';
import { AppModule } from './app.module';

// The gateway itself declares `cors: false` — origin comes from config, which
// isn't loaded yet when the gateway's decorator runs, so it's wired here
// instead, once ConfigService is available, using the same origin as REST.
class ConfiguredIoAdapter extends IoAdapter {
    constructor(app: unknown, private readonly origin: string) {
        super(app);
    }

    createIOServer(port: number, options?: Record<string, unknown>) {
        return super.createIOServer(port, {
            ...options,
            cors: { origin: this.origin, credentials: true },
        });
    }
}

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.enableShutdownHooks();
    const config = app.get(ConfigService);
    const corsOrigin =
        config.get<string>('CORS_ORIGIN') ?? 'http://localhost:5173';

    app.use(json({ limit: '50mb' }));

    app.enableCors({ origin: corsOrigin, credentials: true });
    app.useWebSocketAdapter(new ConfiguredIoAdapter(app, corsOrigin));

    await app.listen(config.get<string>('PORT') ?? 3001);
}
bootstrap();
