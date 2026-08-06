import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiagramEntity } from '../entities/diagram.entity';
import { TableEntity } from '../entities/table.entity';
import { RelationshipEntity } from '../entities/relationship.entity';
import { DependencyEntity } from '../entities/dependency.entity';
import { AreaEntity } from '../entities/area.entity';
import { CustomTypeEntity } from '../entities/custom-type.entity';
import { NoteEntity } from '../entities/note.entity';
import { ConfigEntity } from '../entities/config.entity';
import { DiagramFilterEntity } from '../entities/diagram-filter.entity';
import { GroupEntity } from '../entities/group.entity';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            DiagramEntity,
            TableEntity,
            RelationshipEntity,
            DependencyEntity,
            AreaEntity,
            CustomTypeEntity,
            NoteEntity,
            ConfigEntity,
            DiagramFilterEntity,
            GroupEntity,
        ]),
    ],
    controllers: [StorageController],
    providers: [StorageService],
})
export class StorageModule {}
