import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { Connector } from '@google-cloud/cloud-sql-connector';
import * as schema from "@shared/schema";

let dbInstance: any = null;
let poolInstance: any = null;

export async function initializeDb() {
    if (dbInstance) {
        console.log("Database already initialized.");
        return;
    }

    console.log("Initializing database connection...");

    try {
        if (!process.env.DATABASE_URL) {
            throw new Error("DATABASE_URL must be set.");
        }
        if (!process.env.CLOUD_SQL_CONNECTION_NAME && process.env.NODE_ENV === 'production') {
            throw new Error("CLOUD_SQL_CONNECTION_NAME must be set in production.");
        }

        let client: Pool;

        if (process.env.NODE_ENV === 'production') {
            // Production: Use Cloud SQL Connector for secure connection
            const connector = new Connector();
            const clientOpts = await connector.getOptions({
                instanceConnectionName: process.env.CLOUD_SQL_CONNECTION_NAME!,
                ipType: 'PUBLIC',
            });
            client = new Pool({
                ...clientOpts,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME,
                max: 5,
            });
        } else {
            // Development: Connect directly using DATABASE_URL
            client = new Pool({
                connectionString: process.env.DATABASE_URL,
            });
        }

        await client.connect();
        console.log("Database connection successful.");

        poolInstance = client;
        dbInstance = drizzle(poolInstance, { schema });

    } catch (error) {
        console.error("❌ Failed to initialize database connection:", error);
        process.exit(1); // Exit gracefully if DB connection fails
    }
}

// Export a getter for the db instance
export const getDb = () => {
    if (!dbInstance) {
        throw new Error("Database not initialized. Call initializeDb() first.");
    }
    return dbInstance;
};

// Export a getter for the pool instance
export const getPool = () => {
    if (!poolInstance) {
        throw new Error("Database pool not initialized. Call initializeDb() first.");
    }
    return poolInstance;
};
