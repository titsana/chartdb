import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as Joi from 'joi';
import { AuthModule } from './auth/auth.module';
import { StorageModule } from './storage/storage.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            validationSchema: Joi.object({
                PORT: Joi.number().default(3001),
                DATABASE_URL: Joi.string().required(),
                CORS_ORIGIN: Joi.string(),
                AZURE_AD_TENANT_ID: Joi.string(),
                AZURE_AD_CLIENT_ID: Joi.string(),
            }).and('AZURE_AD_TENANT_ID', 'AZURE_AD_CLIENT_ID'),
        }),
        TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                type: 'postgres',
                url: config.get<string>('DATABASE_URL'),
                autoLoadEntities: true,
                // ponytail: synchronize=true for now, switch to migrations before prod
                synchronize: true,
            }),
        }),
        AuthModule,
        StorageModule,
    ],
})
export class AppModule {}
