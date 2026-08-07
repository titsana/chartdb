import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { CollaborationGateway } from './collaboration.gateway';

@Module({
    imports: [StorageModule],
    providers: [CollaborationGateway],
})
export class CollaborationModule {}
