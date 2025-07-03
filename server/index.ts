// This is the main server entry point.
import express from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import path from "path"; // Import path for serving static files in production

(async () => {
  try {
    const app = express();
    
    // The registerRoutes function sets up all API endpoints and returns the http.Server
    const server = await registerRoutes(app);

    // In development, Vite is used to serve the frontend with HMR.
    if (process.env.NODE_ENV === "development") {
      // Dynamically import Vite modules ONLY in development to avoid including them
      // in the production build, which was causing the 'vite not found' error.
      const { setupVite } = await import("./vite.js");
      await setupVite(app, server);
    } 
    // In production (like on Google Cloud Run), we serve the pre-built static files.
    else {
      const clientDist = path.resolve(process.cwd(), "client/dist");
      console.log(`[prod] Serving static files from: ${clientDist}`);
      app.use(express.static(clientDist));
      // This is crucial for single-page applications (SPAs) like React.
      // It ensures that any direct navigation to a client-side route (e.g., /work-orders)
      // is handled by serving the main index.html file, letting React Router take over.
      app.get("*", (req, res) => {
        res.sendFile(path.resolve(clientDist, "index.html"));
      });
    }

    // In a cloud environment like Cloud Run, the port is assigned by the PORT env var.
    const port = parseInt(process.env.PORT || "5000");

    server.listen({
      port,
      host: "0.0.0.0", // Listen on all network interfaces, required for containers
    }, () => {
      // Use standard console.log as it has no external dependencies.
      console.log(`🚀 Server is listening on port ${port}`);
    });

  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
})();
