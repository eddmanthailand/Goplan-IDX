// Import the standard 'pg' library's Pool
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

// Check for the DATABASE_URL environment variable
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Create a new connection pool using the standard 'pg' driver.
// This is compatible with Google Cloud SQL and other standard PostgreSQL databases.
// We configure it to use SSL for secure connections, which is required by Cloud SQL.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    // This is often required for cloud database connections.
    // It rejects unauthorized or self-signed certificates.
    rejectUnauthorized: false, 
  },
});

// Handle pool errors gracefully to prevent the application from crashing
pool.on('error', (err) => {
  console.error('Database pool error:', err);
});

// Initialize Drizzle ORM with the new 'pg' pool and the schema
export const db = drizzle(pool, { schema });
