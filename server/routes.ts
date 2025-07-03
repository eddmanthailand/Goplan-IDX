import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { pool } from "./db";
import { insertUserSchema, insertTenantSchema, insertProductSchema, insertTransactionSchema, insertCustomerSchema, insertColorSchema, insertSizeSchema, insertWorkTypeSchema, insertDepartmentSchema, insertTeamSchema, insertWorkStepSchema, insertEmployeeSchema, insertWorkQueueSchema, insertProductionCapacitySchema, insertHolidaySchema, insertWorkOrderSchema, insertPermissionSchema, insertDailyWorkLogSchema, permissions, pageAccess, workOrderAttachments, insertNotificationSchema, insertNotificationRuleSchema, insertUserNotificationPreferenceSchema } from "@shared/schema";
import { notificationService } from "./services/notificationService";
// import { GeminiService } from "./services/gemini"; // Temporarily disabled to fix build
import { encrypt, decrypt } from "./encryption";
import { db } from "./db";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcrypt";
import session from "express-session";
import connectPg from "connect-pg-simple";
import memorystore from "memorystore";
import multer from "multer";
import path from "path";
import { fileStorageService } from "./fileStorage.js";

// Initialize default permissions for all pages in the system
async function initializeDefaultPermissions() {
  console.log('Skipping permission initialization to avoid database errors');
}

// Middleware to verify session authentication
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
  // Anti-cache middleware for API routes
  app.use('/api', (req, res, next) => {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store'
    });
    next();
  });

  const MemoryStore = memorystore(session);
  
  app.use(session({
    store: new MemoryStore({
      checkPeriod: 86400000 // prune expired entries every 24h
    }),
    secret: process.env.SESSION_SECRET || 'your-secret-key-here',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  }));

  // Auth routes  
  app.get('/api/auth/user', requireAuth, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const user = await storage.getUser(userId);
      if (user) {
        const { password, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
      } else {
        res.status(401).json({ message: 'User not found' });
      }
    } catch (error) {
      console.error('Auth check error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post("/api/auth/login", async (req: any, res) => {
    try {
      const { username, password } = req.body;
      const user = await storage.getUserByUsername(username);
      if (!user || !await bcrypt.compare(password, user.password)) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      if (!user.isActive) {
        return res.status(401).json({ message: "บัญชีผู้ใช้ถูกปิดการใช้งาน" });
      }
      req.session.userId = user.id;
      req.session.tenantId = user.tenantId;
      req.session.roleId = user.roleId;
      const { password: _, ...userResponse } = user;
      res.json({ user: userResponse });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req: any, res) => {
    req.session.destroy((err: any) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie('connect.sid').json({ message: "Logged out" });
    });
  });

  // Temporarily disable AI Chatbot endpoint to allow the rest of the app to build and deploy.
  app.post("/api/chat/messages", requireAuth, async (req: any, res: any) => {
    res.status(503).json({ 
        message: "AI Chatbot is temporarily disabled for maintenance.",
        action: null 
    });
  });


  const httpServer = createServer(app);
  return httpServer;
}
