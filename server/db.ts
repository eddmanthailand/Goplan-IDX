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
// When running in Cloud Run with a Cloud SQL instance connected via --add-cloudsql-instances,
// the 'pg' library automatically knows how to connect via the secure Unix socket.
// No extra SSL configuration is needed as the connection is already secure.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Handle pool errors gracefully to prevent the application from crashing
pool.on('error', (err) => {
  console.error('Database pool error:', err);
});

// Initialize Drizzle ORM with the new 'pg' pool and the schema
export const db = drizzle(pool, { schema });
