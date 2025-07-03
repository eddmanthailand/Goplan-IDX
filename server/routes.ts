import type { Express } from "express";
import { createServer, type Server } from "http";
import { initializeDb, getDb } from "./db"; // Import the new DB functions
import { storage } from "./storage"; // storage will now use the initialized DB
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcrypt";
import session from "express-session";
import memorystore from "memorystore";

function requireAuth(req: any, res: any, next: any) {
  if (req.session && req.session.userId) {
    req.user = {
      id: req.session.userId,
      tenantId: req.session.tenantId,
      roleId: req.session.roleId
    };
    next();
  } else {
    res.status(401).json({ message: 'Authentication required' });
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // --- CRUCIAL STEP: Initialize Database Connection First ---
  await initializeDb();
  
  const db = getDb(); // Get the initialized DB instance

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // --- Session Management ---
  const MemoryStore = memorystore(session);
  app.use(session({
    store: new MemoryStore({ checkPeriod: 86400000 }),
    secret: process.env.SESSION_SECRET || 'a-very-secret-key-for-development',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
    },
  }));

  // --- API Routes ---

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "ok" });
  });
  
  // Auth routes
  app.post("/api/auth/login", async (req: any, res) => {
    try {
      const { username, password } = req.body;
      const user = await db.query.users.findFirst({ where: eq(users.username, username) });
      
      if (!user || !await bcrypt.compare(password, user.password)) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      if (!user.isActive) {
        return res.status(403).json({ message: "User account is disabled" });
      }
      
      req.session.userId = user.id;
      req.session.tenantId = user.tenantId;
      req.session.roleId = user.roleId;
      
      const { password: _, ...userResponse } = user;
      res.json({ user: userResponse });

    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed due to an internal error" });
    }
  });

  // All other routes are temporarily disabled for this minimal deployment
  app.use((req, res) => {
    res.status(404).json({ message: "API endpoint not found in minimal deployment." });
  });

  const httpServer = createServer(app);
  return httpServer;
}
