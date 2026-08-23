import { Module } from '@nestjs/common';
import { CollabModule } from './collab/collab.module';
import { DiagramsModule } from './diagrams/diagrams.module';
import { DiagramGroupsModule } from './diagram-groups/diagram-groups.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';

@Module({
    imports: [AuthModule, CollabModule, DiagramsModule, DiagramGroupsModule],
    controllers: [HealthController],
})
export class AppModule {}
