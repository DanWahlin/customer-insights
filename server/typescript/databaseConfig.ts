import type { PoolConfig } from 'pg';
import './config';

function getSslConfig(): PoolConfig['ssl'] | undefined {
  const sslMode = (process.env.PGSSLMODE || '').trim().toLowerCase();
  if (!sslMode || sslMode === 'disable') return undefined;

  return {
    rejectUnauthorized: false
  };
}

const ssl = getSslConfig();

export const databaseConfig: PoolConfig = {
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST || 'localhost',
  database: process.env.POSTGRES_DATABASE || 'CustomersDB',
  password: process.env.POSTGRES_PASSWORD,
  port: Number(process.env.POSTGRES_PORT || 5432),
  ...(ssl ? { ssl } : {})
};

export const runtimeDatabaseConfig: PoolConfig = {
  ...databaseConfig,
  user: 'app_runtime'
};
