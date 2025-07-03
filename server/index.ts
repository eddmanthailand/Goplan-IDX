import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDb } from './db';
import createApiRouter from './routes'; // Import the router factory function
import { createServer } from 'http'; // createServer is needed if registerRoutes returns it

async function startServer() {
  try {
    // 1. Initialize the database connection and get the db instance.
    const db = await initializeDb();
    console.log('Database initialization complete.');

    const app = express();
    const isProduction = process.env.NODE_ENV === 'production';
    const PORT = process.env.PORT || 5000;

    app.use(express.json());

    // 2. Create the router by passing the db instance and use it.
    const apiRouter = createApiRouter(db);
    app.use('/api', apiRouter);

    // --- Static File Serving (for Production) ---
    if (isProduction) {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      // Correcting the path to be relative to the built 'dist' folder
      const clientBuildPath = path.join(__dirname, '../client/dist');
      
      console.log(`[Production] Serving static files from: ${clientBuildPath}`);
      app.use(express.static(clientBuildPath));
      
      // For any other request, serve the index.html for SPA routing
      app.get('*', (req, res) => {
        res.sendFile(path.join(clientBuildPath, 'index.html'));
      });
    }

    // 3. Start listening only after everything is set up
    const server = createServer(app);
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server is running and listening on port ${PORT}`);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1); // Exit with an error code
  }
}

// Start the server
startServer();
