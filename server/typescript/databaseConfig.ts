import type { PoolConfig } from 'pg';
import './config';

export const databaseConfig: PoolConfig = {
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST || 'localhost',
  database: process.env.POSTGRES_DATABASE || 'CustomersDB',
  password: process.env.POSTGRES_PASSWORD,
  port: Number(process.env.POSTGRES_PORT || 5432)
};

export const runtimeDatabaseConfig: PoolConfig = {
  ...databaseConfig,
  user: 'app_runtime'
};
