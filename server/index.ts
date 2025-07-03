import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDb } from './db'; // Import the async initializer
import { registerRoutes } from './routes'; // Re-importing the routes
import { createServer } from 'http'; // Needed for registerRoutes

async function startServer() {
  try {
    // 1. Initialize the database connection. This is now the first and most crucial step.
    await initializeDb();
    console.log('Database initialization complete.');

    const app = express();
    const isProduction = process.env.NODE_ENV === 'production';
    const PORT = process.env.PORT || 5000; // Keep port 5000 as per original setup

    // 2. Register all your existing API routes. 
    // The `registerRoutes` function will now have access to an initialized database.
    const server = await registerRoutes(app);

    // --- Static File Serving (for Production) ---
    if (isProduction) {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      // Correcting the path to be relative to the current file's directory in the 'dist' folder
      const clientBuildPath = path.join(__dirname, 'client/dist');
      
      console.log(`[Production] Serving static files from: ${clientBuildPath}`);
      app.use(express.static(clientBuildPath));
      
      // For any other request, serve the index.html for SPA routing
      app.get('*', (req, res) => {
        res.sendFile(path.join(clientBuildPath, 'index.html'));
      });
    }

    // 3. Start listening only after everything is set up
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
