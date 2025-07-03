import express from 'express';
import type { DrizzleDb } from './db';
import { StorageService } from './storage'; // Import the new StorageService class

// This function now acts as a "factory" for our router.
// It takes the initialized db instance and creates a new StorageService with it.
// This ensures all routes have access to the same, ready-to-use database connection.
export default function createApiRouter(db: DrizzleDb) {
  const router = express.Router();
  const storage = new StorageService(db); // Create a new storage instance with the db connection

  // --- API Routes ---

  // Health check route
  router.get('/health', (req, res) => {
    res.status(200).send({ status: 'ok', message: 'API is healthy' });
  });

  // Example: Work Orders Route
  router.get('/work-orders', async (req, res) => {
    try {
      const tenantId = "550e8400-e29b-41d4-a716-446655440000"; // Placeholder
      const workOrders = await storage.getWorkOrders(tenantId);
      res.json(workOrders);
    } catch (error) {
      console.error("Get work orders error:", error);
      res.status(500).json({ message: "Failed to get work orders" });
    }
  });
  
  // All other routes would be defined here, using the `storage` instance.
  // For example:
  // router.post('/users', async (req, res) => { 
  //   const newUser = await storage.createUser(req.body);
  //   res.json(newUser);
  // });

  return router;
}
