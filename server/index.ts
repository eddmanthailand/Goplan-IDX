// This is the main server entry point.
// It's responsible for setting up the Express server, session management,
// registering all API routes, and starting the server.

import express from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
// Vite is a dev dependency, so it's only imported in development.
// We use a dynamic import to prevent it from being included in the production bundle.
// import { setupVite, serveStatic, log } from "./vite"; 

(async () => {
  try {
    const app = express();
    
    // The registerRoutes function sets up all API endpoints and returns the http.Server
    const server = await registerRoutes(app);

    // In development, Vite handles HMR (Hot Module Replacement) and serves the frontend.
    // In production, we serve the pre-built static files from client/dist.
    if (process.env.NODE_ENV === "development") {
      const { setupVite } = await import("./vite.js");
      await setupVite(app, server);
    } else {
      const { serveStatic } = await import("./vite.js");
      serveStatic(app);
    }

    // In a cloud environment like Google Cloud Run, the port is assigned dynamically
    // via the PORT environment variable. We must listen on this port.
    // We fall back to 5000 for local development if process.env.PORT is not set.
    const port = parseInt(process.env.PORT || "5000");
    const { log } = await import("./vite.js");

    server.listen({
      port,
      host: "0.0.0.0", // Listen on all network interfaces
    }, () => {
      // Corrected the template literal syntax - NO backslash before the backtick.
      log(`Server is listening on port ${port}`);
    });

  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
})();
