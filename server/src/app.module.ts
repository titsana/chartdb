import { Module } from '@nestjs/common';
import { CollabModule } from './collab/collab.module';
import { HealthController } from './health.controller';

@Module({
    imports: [CollabModule],
    controllers: [HealthController],
})
export class AppModule {}
