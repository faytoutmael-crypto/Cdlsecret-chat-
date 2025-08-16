import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import session from "express-session";
import { storage } from "./storage";
import { 
  loginSchema, 
  registerSchema,
  oldLoginSchema,
  codeAccessSchema,
  createCodeSchema,
  insertAccessCodeSchema,
  insertMessageSchema, 
  insertActiveVoteSchema, 
  voteSchema, 
  updateRankSchema, 
  type User, 
  type MessageWithUser
} from "@shared/schema";
import { z } from "zod";
import bcrypt from "bcryptjs";

interface AuthenticatedWebSocket extends WebSocket {
  userId?: number;
  user?: User;
}

declare module 'express-session' {
  interface SessionData {
    userId?: number;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Configure session middleware
  app.use(session({
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
  }));

  const httpServer = createServer(app);
  
  // WebSocket server setup
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  const connectedClients = new Map<number, AuthenticatedWebSocket>();

  // Broadcast message to all connected clients
  function broadcast(message: any, excludeUserId?: number) {
    const messageStr = JSON.stringify(message);
    connectedClients.forEach((client, userId) => {
      if (client.readyState === WebSocket.OPEN && userId !== excludeUserId) {
        client.send(messageStr);
      }
    });
  }

  // Broadcast message filtered by access code
  function broadcastToAccessCode(message: any, senderAccessCode: string | null, excludeUserId?: number) {
    const messageStr = JSON.stringify(message);
    connectedClients.forEach((client, userId) => {
      if (client.readyState === WebSocket.OPEN && userId !== excludeUserId && client.user) {
        const clientUser = client.user;
        
        // Check if this user should receive the message based on access code
        let shouldReceive = false;
        
        const clientAccessCode = clientUser.accountType === "full" ? null : clientUser.accessCode;
        
        // If client has full account
        if (clientAccessCode === null) {
          // Full account users can see messages from full accounts and "3.4.12" users
          shouldReceive = senderAccessCode === null || senderAccessCode === "3.4.12";
        } else if (clientAccessCode === "3.4.12") {
          // Code "3.4.12" users can see messages from full accounts and other "3.4.12" users
          shouldReceive = senderAccessCode === null || senderAccessCode === "3.4.12";
        } else {
          // Other code users can only see messages from users with the exact same access code
          shouldReceive = clientAccessCode === senderAccessCode;
        }
        
        if (shouldReceive) {
          client.send(messageStr);
        }
      }
    });
  }

  // WebSocket connection handling
  wss.on('connection', (ws: AuthenticatedWebSocket) => {
    console.log('New WebSocket connection');

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'authenticate':
            const user = await storage.getUser(message.userId);
            if (user) {
              ws.userId = user.id;
              ws.user = user;
              connectedClients.set(user.id, ws);
              await storage.setUserOnlineStatus(user.id, true);
              
              // Broadcast user online status to users with same access code
              broadcastToAccessCode({
                type: 'userOnline',
                user: user
              }, user.accountType === "full" ? null : user.accessCode);
              
              // Send current online users filtered by access code
              const onlineUsers = await storage.getOnlineUsersByAccessCode(
                user.accountType === "full" ? null : user.accessCode
              );
              ws.send(JSON.stringify({
                type: 'onlineUsers',
                users: onlineUsers
              }));
            }
            break;

          case 'message':
            if (ws.userId && ws.user) {
              const newMessage = await storage.createMessage({
                userId: ws.userId,
                content: message.content
              });
              
              // Broadcast message only to users with same access code
              broadcastToAccessCode({
                type: 'newMessage',
                message: newMessage
              }, ws.user.accountType === "full" ? null : ws.user.accessCode);
            }
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', async () => {
      if (ws.userId) {
        connectedClients.delete(ws.userId);
        await storage.setUserOnlineStatus(ws.userId, false);
        
        // Broadcast user offline status to users with same access code
        if (ws.user) {
          broadcastToAccessCode({
            type: 'userOffline',
            user: { ...ws.user, isOnline: false }
          }, ws.user.accountType === "full" ? null : ws.user.accessCode);
        }
      }
    });
  });

  // Registration endpoint - creates full account
  app.post("/api/register", async (req, res) => {
    try {
      const data = registerSchema.parse(req.body);
      
      // Check if username or email already exists
      const existingUser = await storage.getUserByUsername(data.username.trim());
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }
      
      const existingEmail = await storage.getUserByEmail(data.email);
      if (existingEmail) {
        return res.status(400).json({ message: "Email already exists" });
      }
      
      // Hash password
      const passwordHash = await bcrypt.hash(data.password, 10);
      
      // Check if this is the first user (gets admin rank)
      const userCount = await storage.getUserCount();
      const rank = userCount === 0 ? 0 : 10; // First user gets admin rank
      
      // Create user
      const user = await storage.createUser({
        username: data.username.trim(),
        email: data.email,
        passwordHash,
        firstName: data.firstName || null,
        lastName: data.lastName || null,
        accountType: "full",
        rank
      });
      
      // Set session
      if (req.session) {
        req.session.userId = user.id;
      }
      
      res.json({ user: { ...user, passwordHash: undefined } });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Login endpoint for registered users
  app.post("/api/login", async (req, res) => {
    try {
      const { username, password } = loginSchema.parse(req.body);
      
      const user = await storage.getUserByUsername(username.trim());
      if (!user || !user.passwordHash || user.accountType !== "full") {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      // Set session
      if (req.session) {
        req.session.userId = user.id;
      }
      
      res.json({ user: { ...user, passwordHash: undefined } });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Code verification endpoint - just checks if code is valid
  app.post("/api/verify-code", async (req, res) => {
    try {
      const { code } = req.body;
      
      // Check if code exists and is active
      const accessCode = await storage.getAccessCodeByCode(code);
      if (!accessCode || !accessCode.isActive) {
        return res.status(401).json({ message: "Invalid or inactive access code" });
      }
      
      res.json({ valid: true, message: "Code is valid" });
    } catch (error) {
      console.error("Code verification error:", error);
      res.status(500).json({ message: "Verification failed" });
    }
  });

  // Code access endpoint - for new users or updating existing users' access codes
  app.post("/api/code-access", async (req, res) => {
    try {
      const { code, username, email } = codeAccessSchema.parse(req.body);
      
      // Check if code exists and is active
      const accessCode = await storage.getAccessCodeByCode(code);
      if (!accessCode || !accessCode.isActive) {
        return res.status(401).json({ message: "Invalid or inactive access code" });
      }

      // Check if user is already logged in (has a session)
      if (req.session?.userId) {
        // Update existing user's access code
        const existingUser = await storage.getUser(req.session.userId);
        if (existingUser) {
          // Update user's access code
          await storage.updateUserAccessCode(existingUser.id, code);
          const updatedUser = await storage.getUser(existingUser.id);
          return res.json({ user: { ...updatedUser, passwordHash: undefined } });
        }
      }
      
      // For new users without session, create new limited account
      // Check if username already exists (only for non-logged-in users)
      const existingUser = await storage.getUserByUsername(username.trim());
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }
      
      // Create limited user with code access
      const user = await storage.createUser({
        username: username.trim(),
        email,
        passwordHash: null, // No password for code users
        firstName: username,
        lastName: null,
        accountType: "code",
        accessCode: code,
        rank: 10 // Code users never get admin privileges
      });
      
      // Set session
      if (req.session) {
        req.session.userId = user.id;
      }
      
      res.json({ user: { ...user, passwordHash: undefined } });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      console.error("Code access error:", error);
      res.status(500).json({ message: "Access denied" });
    }
  });

  // Create access code endpoint (admin only)
  app.post("/api/create-code", async (req, res) => {
    try {
      let userId: number | null = null;
      
      // Get user ID from session
      if (req.session?.userId) {
        userId = req.session.userId;
      }
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const user = await storage.getUser(userId);
      if (!user || user.rank !== 0 || user.accountType !== "full") {
        return res.status(403).json({ message: "Only full account admins can create codes" });
      }
      
      const { code } = createCodeSchema.parse(req.body);
      
      // Check if code already exists
      const existingCode = await storage.getAccessCodeByCode(code);
      if (existingCode) {
        return res.status(400).json({ message: "Code already exists" });
      }
      
      const accessCode = await storage.createAccessCode({
        code,
        createdBy: userId,
        isActive: true
      });
      
      res.json({ accessCode });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      console.error("Create code error:", error);
      res.status(500).json({ message: "Failed to create code" });
    }
  });

  // Get current user endpoint
  app.get("/api/auth/user", async (req, res) => {
    try {
      let userId: number | null = null;
      
      // Get user ID from session
      if (req.session?.userId) {
        userId = req.session.userId;
      }
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      
      res.json({ ...user, passwordHash: undefined });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Logout endpoint
  app.post('/api/logout', async (req, res) => {
    try {
      if ((req as any).session) {
        (req as any).session.destroy((err: any) => {
          if (err) {
            console.error("Session destruction error:", err);
            return res.status(500).json({ message: "Logout failed" });
          }
          res.json({ message: "Logged out successfully" });
        });
      } else {
        res.json({ message: "Already logged out" });
      }
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ message: "Logout failed" });
    }
  });

  // Legacy login endpoint (to be removed)
  app.post("/api/old-login", async (req, res) => {
    try {
      const { code, username } = oldLoginSchema.parse(req.body);
      
      if (code !== "3.4.12") {
        return res.status(401).json({ message: "Invalid access code" });
      }

      let user = await storage.getUserByUsername(username);
      if (!user) {
        // Create new user with default rank 10 and required email field
        user = await storage.createUser({ 
          username, 
          email: `${username}@legacy.local`, // Legacy users get a placeholder email
          rank: 10,
          accountType: "code",
          passwordHash: null
        });
      }

      res.json({ user });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get current user
  app.get("/api/user/:id", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json({ user });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get online users
  app.get("/api/users/online", async (req, res) => {
    try {
      let userId: number | null = null;
      
      // Get user ID from session
      if (req.session?.userId) {
        userId = req.session.userId;
      }
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ message: "User not found" });
      }
      
      // Get users filtered by access code
      const users = await storage.getOnlineUsersByAccessCode(
        currentUser.accountType === "full" ? null : currentUser.accessCode
      );
      
      res.json({ users });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get all users (admin only)
  app.get("/api/users/all", async (req, res) => {
    try {
      let userId: number | null = null;
      
      // Get user ID from session
      if (req.session?.userId) {
        userId = req.session.userId;
      }
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const requestingUser = await storage.getUser(userId);
      if (!requestingUser || requestingUser.rank !== 0) {
        return res.status(403).json({ message: "Only administrators can access all users list" });
      }
      
      const users = await storage.getAllUsers();
      // Remove password hashes from response for security
      const safeUsers = users.map(user => ({ ...user, passwordHash: undefined }));
      res.json({ users: safeUsers });
    } catch (error) {
      console.error("Error fetching all users:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get user messages (admin only)
  app.get("/api/users/:userId/messages", async (req, res) => {
    try {
      let requesterId: number | null = null;
      
      // Get user ID from session
      if (req.session?.userId) {
        requesterId = req.session.userId;
      }
      
      if (!requesterId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const requester = await storage.getUser(requesterId);
      if (!requester || requester.rank !== 0) {
        return res.status(403).json({ message: "Seuls les administrateurs peuvent voir l'historique des messages" });
      }
      
      const targetUserId = parseInt(req.params.userId);
      if (isNaN(targetUserId)) {
        return res.status(400).json({ message: "ID utilisateur invalide" });
      }
      
      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ message: "Utilisateur non trouvé" });
      }
      
      const userMessages = await storage.getUserMessages(targetUserId);
      res.json({ 
        user: { ...targetUser, passwordHash: undefined },
        messages: userMessages 
      });
    } catch (error) {
      console.error("Get user messages error:", error);
      res.status(500).json({ message: "Échec de récupération des messages" });
    }
  });

  // Get recent messages
  app.get("/api/messages", async (req, res) => {
    try {
      let userId: number | null = null;
      
      // Get user ID from session
      if (req.session?.userId) {
        userId = req.session.userId;
      }
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ message: "User not found" });
      }
      
      // Get messages filtered by access code
      const messages = await storage.getRecentMessagesByAccessCode(
        currentUser.accountType === "full" ? null : currentUser.accessCode,
        50
      );
      
      res.json({ messages });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Send message (REST endpoint as backup)
  app.post("/api/messages", async (req, res) => {
    try {
      let userId: number | null = null;
      
      // Get user ID from session
      if (req.session?.userId) {
        userId = req.session.userId;
      }
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Parse only content from request body
      const { content } = req.body;
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ message: "Le contenu du message est requis" });
      }
      
      // Create message data with userId from session
      const messageData = { userId, content: content.trim() };
      
      const message = await storage.createMessage(messageData);
      
      // Get message author to determine access code for broadcasting
      const messageAuthor = await storage.getUser(userId);
      if (messageAuthor) {
        // Broadcast to WebSocket clients with same access code
        broadcastToAccessCode({
          type: 'newMessage',
          message: message
        }, messageAuthor.accountType === "full" ? null : messageAuthor.accessCode);
      }
      
      res.json({ message });
    } catch (error) {
      console.error("Send message error:", error);
      res.status(500).json({ message: "Erreur lors de l'envoi du message" });
    }
  });

  // Get laws
  app.get("/api/laws", async (req, res) => {
    try {
      const laws = await storage.getLaws();
      res.json({ laws });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get active votes
  app.get("/api/votes", async (req, res) => {
    try {
      const votes = await storage.getActiveVotes();
      res.json({ votes });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create new vote proposal
  app.post("/api/votes", async (req, res) => {
    try {
      const voteData = insertActiveVoteSchema.parse(req.body);
      
      // Check if the proposing user has voting rights
      const user = await storage.getUser(voteData.proposedBy);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Check proposal eligibility: same rules as voting
      if (user.accountType === "code" && user.accessCode !== "3.4.12") {
        return res.status(403).json({ message: "Vous n'avez pas les droits de proposer des votes. Seuls les comptes complets et les utilisateurs du code 3.4.12 peuvent proposer des votes." });
      }
      
      const vote = await storage.createActiveVote(voteData);
      
      // Broadcast new vote to all clients
      broadcast({
        type: 'newVote',
        vote: vote
      });
      
      res.json({ vote });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Cast vote
  app.post("/api/votes/cast", async (req, res) => {
    try {
      const { userId, voteId, vote } = req.body;
      
      // Check if user exists and has voting rights
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Check voting eligibility: full accounts can vote, code accounts can only vote if they used code "3.4.12"
      if (user.accountType === "code" && user.accessCode !== "3.4.12") {
        return res.status(403).json({ message: "Vous n'avez pas les droits de vote. Seuls les comptes complets et les utilisateurs du code 3.4.12 peuvent voter." });
      }
      
      const hasVoted = await storage.hasUserVoted(userId, voteId);
      if (hasVoted) {
        return res.status(400).json({ message: "User has already voted" });
      }
      
      const success = await storage.castVote(userId, voteId, vote);
      if (!success) {
        return res.status(400).json({ message: "Failed to cast vote" });
      }
      
      const results = await storage.getVoteResults(voteId);
      
      // Broadcast vote update to all clients
      broadcast({
        type: 'voteUpdate',
        voteId: voteId,
        results: results
      });
      
      res.json({ success: true, results });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update user rank (admin only)
  app.post("/api/users/rank", async (req, res) => {
    try {
      const { userId, newRank, adminUserId } = req.body;
      
      // Check if admin user has rank 0
      const adminUser = await storage.getUser(adminUserId);
      if (!adminUser || adminUser.rank !== 0) {
        return res.status(403).json({ message: "Only rank 0 users can modify ranks" });
      }
      
      const updatedUser = await storage.updateUserRank(userId, newRank);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Broadcast rank update to all clients
      broadcast({
        type: 'rankUpdate',
        user: updatedUser
      });
      
      res.json({ user: updatedUser });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get all access codes (admin only)
  app.get("/api/access-codes", async (req, res) => {
    try {
      let userId: number | null = null;
      
      // Get user ID from session
      if (req.session?.userId) {
        userId = req.session.userId;
      }
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const requestingUser = await storage.getUser(userId);
      if (!requestingUser || requestingUser.rank !== 0) {
        return res.status(403).json({ message: "Only administrators can view access codes" });
      }
      
      const accessCodes = await storage.getAllAccessCodes();
      res.json({ accessCodes });
    } catch (error) {
      console.error("Error fetching access codes:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create new access code (public endpoint)
  app.post("/api/access-codes", async (req, res) => {
    try {
      const { code } = createCodeSchema.parse(req.body);
      
      const newAccessCode = await storage.createAccessCode({
        code: code.trim(),
        createdBy: 1, // System created since no user is logged in
        isActive: true
      });
      
      res.json({ accessCode: newAccessCode });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Code invalide", errors: error.errors });
      }
      if (error instanceof Error && error.message === "Access code already exists") {
        return res.status(409).json({ message: "Ce code d'accès existe déjà" });
      }
      console.error("Error creating access code:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  return httpServer;
}
