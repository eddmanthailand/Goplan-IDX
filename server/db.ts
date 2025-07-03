import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { Connector } from '@google-cloud/cloud-sql-connector';
import * as schema from '../shared/schema';

const isProduction = process.env.NODE_ENV === 'production';

// This function will now handle the async setup
export async function initializeDb() {
  let pool: Pool;

  if (isProduction) {
    // --- Production Mode (Cloud Run) ---
    if (!process.env.CLOUD_SQL_INSTANCE_CONNECTION_NAME || !process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_NAME) {
      throw new Error('Missing required database environment variables for production.');
    }

    const connector = new Connector();
    const clientOpts = await connector.getOptions({
      instanceConnectionName: process.env.CLOUD_SQL_INSTANCE_CONNECTION_NAME,
      ipType: 'PUBLIC',
    });

    pool = new Pool({
      ...clientOpts,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      max: 5,
    });
  } else {
    // --- Development Mode (Local/IDX) ---
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set for development.');
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }

  // Check connection
  const client = await pool.connect();
  console.log('Database connected successfully!');
  client.release();

  // Return the drizzle instance
  return drizzle(pool, { schema });
}
