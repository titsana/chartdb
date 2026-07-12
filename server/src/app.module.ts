import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageModule } from './storage/storage.module';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
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
        StorageModule,
    ],
})
export class AppModule {}
