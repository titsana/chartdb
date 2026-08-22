import { Module } from '@nestjs/common';
import { CollabModule } from './collab/collab.module';
import { DiagramsModule } from './diagrams/diagrams.module';
import { HealthController } from './health.controller';

@Module({
    imports: [CollabModule, DiagramsModule],
    controllers: [HealthController],
})
export class AppModule {}
