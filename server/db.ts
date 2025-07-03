import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { Connector, IpAddressTypes } from '@google-cloud/cloud-sql-connector';
import { parse } from 'pg-connection-string';

// Check for the DATABASE_URL environment variable
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set for the application.");
}

const config = parse(process.env.DATABASE_URL);
const connector = new Connector();

const client = new Pool({
  // The 'pg' library requires the following details to connect to the Cloud SQL instance
  user: config.user,
  password: config.password,
  database: config.database,
  // The 'getSocketPath' method creates a secure Unix socket connection to the instance
  // This is the recommended and most secure way to connect from Cloud Run
  host: await connector.getSocketPath({
    instanceConnectionName: process.env.CLOUD_SQL_CONNECTION_NAME || "",
    ipType: IpAddressTypes.PUBLIC,
  }),
});

export const db = drizzle(client, { schema: {} });

// We export the raw client as 'pool' to maintain compatibility with other parts of the app
export const pool = client;
