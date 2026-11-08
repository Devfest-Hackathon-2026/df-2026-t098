import 'dotenv/config';
import { DataSource } from 'typeorm';
import { databaseSsl } from './database-ssl';
import { LEARNING_ENTITIES } from './learning/entities/learning.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DB_URL,
  synchronize: false,
  logging: false,
  entities: [
    __dirname + '/entities/*.entity{.ts,.js}',
    __dirname + '/auth/sessions/*.entity{.ts,.js}',
    ...LEARNING_ENTITIES,
  ],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  ssl: databaseSsl(),
});
