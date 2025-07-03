import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { pool } from "./db";
import { insertUserSchema, insertTenantSchema, insertProductSchema, insertTransactionSchema, insertCustomerSchema, insertColorSchema, insertSizeSchema, insertWorkTypeSchema, insertDepartmentSchema, insertTeamSchema, insertWorkStepSchema, insertEmployeeSchema, insertWorkQueueSchema, insertProductionCapacitySchema, insertHolidaySchema, insertWorkOrderSchema, insertPermissionSchema, insertDailyWorkLogSchema, permissions, pageAccess, workOrderAttachments, insertNotificationSchema, insertNotificationRuleSchema, insertUserNotificationPreferenceSchema } from "@shared/schema";
import { notificationService } from "./services/notificationService";
import { GeminiService } from "./services/gemini";
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
  // Skip initialization to avoid complex queries that cause Neon errors
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

  // ===== NEW AI CHATBOT ENDPOINT =====
  app.post("/api/chat/messages", requireAuth, async (req: any, res: any) => {
    const { conversationId, message } = req.body;
    const { tenantId, id: userId } = req.user;

    if (!conversationId || !message) {
        return res.status(400).json({ message: "conversationId and message are required" });
    }

    try {
        // 1. Save the user's message
        const userMessage = await storage.createChatMessage({
            conversationId: parseInt(conversationId),
            role: 'user',
            content: message.trim(),
        });

        // 2. Initialize Gemini Service
        const aiConfig = await storage.getAiConfiguration(tenantId);
        const apiKey = aiConfig?.encryptedApiKey ? decrypt(aiConfig.encryptedApiKey) : undefined;
        const geminiService = new GeminiService(apiKey);

        // 3. Process the request to determine if it's an action or a simple chat
        const aiResponse = await geminiService.processUserRequestToAction(message.trim(), tenantId);

        let assistantContent: string;
        let responseData: any = {};

        if (aiResponse.action) {
            // It's an action! The response is already a structured object.
            assistantContent = JSON.stringify(aiResponse); // Store the full action object
            responseData = aiResponse;
        } else {
            // It's a simple chat or an error message from the action workflow.
            const simpleChatResponse = await geminiService.generateSimpleChatResponse(message.trim());
            assistantContent = simpleChatResponse;
            responseData = { message: simpleChatResponse, action: null };
        }

        // 4. Save the assistant's response
        const assistantMessage = await storage.createChatMessage({
            conversationId: parseInt(conversationId),
            role: 'assistant',
            content: assistantContent,
        });

        // 5. Send the structured response to the frontend
        res.json({
            userMessage,
            assistantMessage: {
              ...assistantMessage,
              // The frontend expects the content to be the structured response object
              // So, we replace the stringified content with the actual object for the response
              content: responseData 
            }
        });

    } catch (error) {
        console.error("Chat processing error:", error);
        res.status(500).json({ message: "Failed to process chat message" });
    }
  });


  const httpServer = createServer(app);
  return httpServer;
}
