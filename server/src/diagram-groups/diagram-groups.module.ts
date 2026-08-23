import { Module } from '@nestjs/common';
import { CollabModule } from '../collab/collab.module';
import { DiagramGroupsController } from './diagram-groups.controller';

@Module({
    imports: [CollabModule],
    controllers: [DiagramGroupsController],
})
export class DiagramGroupsModule {}
