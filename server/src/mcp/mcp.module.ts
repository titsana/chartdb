import { Module } from '@nestjs/common';
import { CollabModule } from '../collab/collab.module';
import { McpController } from './mcp.controller';

@Module({
    imports: [CollabModule],
    controllers: [McpController],
})
export class McpModule {}
