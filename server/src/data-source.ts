import 'dotenv/config';
import { DataSource } from 'typeorm';

// Used by the typeorm CLI for migration:generate/run/revert. The app itself
// builds its own DataSource via TypeOrmModule.forRootAsync in app.module.ts.
export default new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: [__dirname + '/entities/*.entity{.ts,.js}'],
    migrations: [__dirname + '/migrations/*{.ts,.js}'],
});
