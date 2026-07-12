import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    const config = app.get(ConfigService);

    app.enableCors({
        origin: config.get<string>('CORS_ORIGIN') ?? 'http://localhost:5173',
        credentials: true,
    });

    await app.listen(config.get<string>('PORT') ?? 3001);
}
bootstrap();
