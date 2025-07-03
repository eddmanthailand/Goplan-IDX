import { eq, desc, and, isNull, sql } from 'drizzle-orm';
import type { DrizzleDb } from './db';
import * as schema from '../shared/schema';

// This new structure uses Dependency Injection.
// Instead of importing 'db' directly, the class receives the 'db' instance
// during its creation. This makes the storage layer more modular and easier to test.
export class StorageService {
    private db: DrizzleDb;

    constructor(db: DrizzleDb) {
        this.db = db;
    }

    // Example of a refactored function
    async getWorkOrders(tenantId: string) {
        return this.db.query.workOrders.findMany({
            where: eq(schema.workOrders.tenantId, tenantId),
            with: {
                customer: true,
            },
            orderBy: [desc(schema.workOrders.createdAt)],
        });
    }

    // --- User Management ---
    async getUser(id: number) {
        return this.db.query.users.findFirst({
            where: eq(schema.users.id, id)
        });
    }
    
    async getUserByUsername(username: string) {
        return this.db.query.users.findFirst({
            where: and(eq(schema.users.username, username), isNull(schema.users.deletedAt))
        });
    }
    
    // Add all other storage methods here, using `this.db`
    // For example:
    // async getCustomers(tenantId: string) {
    //   return this.db.query.customers.findMany({ ... });
    // }
}
