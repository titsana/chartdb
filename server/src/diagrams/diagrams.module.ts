import { Module } from '@nestjs/common';
import { CollabModule } from '../collab/collab.module';
import { DiagramsController } from './diagrams.controller';

@Module({
    imports: [CollabModule],
    controllers: [DiagramsController],
})
export class DiagramsModule {}
