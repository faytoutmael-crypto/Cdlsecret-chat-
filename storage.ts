import { users, messages, laws, activeVotes, activeVoteUsers, accessCodes, type User, type CreateUser, type Message, type InsertMessage, type Law, type InsertLaw, type ActiveVote, type InsertActiveVote, type AccessCode, type MessageWithUser, type VoteRequest, type UpdateRankRequest } from "@shared/schema";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserCount(): Promise<number>;
  createUser(user: CreateUser): Promise<User>;
  updateUserRank(userId: number, newRank: number): Promise<User | undefined>;
  setUserOnlineStatus(userId: number, isOnline: boolean): Promise<void>;
  getAllUsers(): Promise<User[]>;
  getOnlineUsers(): Promise<User[]>;
  getOnlineUsersByAccessCode(accessCode: string | null): Promise<User[]>;
  
  // Access Codes
  getAccessCodeByCode(code: string): Promise<AccessCode | undefined>;
  createAccessCode(accessCode: { code: string; createdBy: number; isActive: boolean }): Promise<AccessCode>;
  getAllAccessCodes(): Promise<AccessCode[]>;
  
  // Messages
  createMessage(message: InsertMessage): Promise<MessageWithUser>;
  getRecentMessages(limit?: number): Promise<MessageWithUser[]>;
  getRecentMessagesByAccessCode(accessCode: string | null, limit?: number): Promise<MessageWithUser[]>;
  
  // Laws
  getLaws(): Promise<Law[]>;
  createLaw(law: InsertLaw): Promise<Law>;
  
  // Active Votes
  getActiveVotes(): Promise<ActiveVote[]>;
  createActiveVote(vote: InsertActiveVote): Promise<ActiveVote>;
  castVote(userId: number, voteId: number, vote: "yes" | "no"): Promise<boolean>;
  hasUserVoted(userId: number, voteId: number): Promise<boolean>;
  getVoteResults(voteId: number): Promise<{ yes: number; no: number; total: number }>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private messages: Map<number, MessageWithUser>;
  private laws: Map<number, Law>;
  private activeVotes: Map<number, ActiveVote>;
  private activeVoteUsers: Map<string, { userId: number; voteId: number; vote: "yes" | "no" }>;
  private accessCodes: Map<string, AccessCode>;
  private currentUserId: number;
  private currentMessageId: number;
  private currentLawId: number;
  private currentVoteId: number;
  private currentAccessCodeId: number;

  constructor() {
    this.users = new Map();
    this.messages = new Map();
    this.laws = new Map();
    this.activeVotes = new Map();
    this.activeVoteUsers = new Map();
    this.accessCodes = new Map();
    this.currentUserId = 1;
    this.currentMessageId = 1;
    this.currentLawId = 1;
    this.currentVoteId = 1;
    this.currentAccessCodeId = 1;

    // Initialize with some default data
    this.initializeDefaultData();
  }

  private initializeDefaultData() {
    const defaultLaws = [
      {
        title: "Respectful Communication",
        description: "All members must maintain respectful communication at all times. Harassment, hate speech, or discriminatory language will result in immediate action.",
        status: "active" as const,
        passedVotes: 17,
        totalVotes: 20,
        createdAt: new Date("2024-01-15"),
      },
      {
        title: "Rank Promotion Guidelines", 
        description: "Rank promotions are based on positive contributions to the community, adherence to laws, and active participation over a minimum period of 30 days.",
        status: "active" as const,
        passedVotes: 23,
        totalVotes: 25,
        createdAt: new Date("2024-01-20"),
      },
      {
        title: "Voting Participation",
        description: "All members rank 3 and above are encouraged to participate in community votes. Quorum for law passage is set at 60% of eligible voters.",
        status: "active" as const,
        passedVotes: 19,
        totalVotes: 24,
        createdAt: new Date("2024-02-01"),
      }
    ];

    defaultLaws.forEach(law => {
      const id = this.currentLawId++;
      this.laws.set(id, { ...law, id });
    });

    // Add sample active vote
    const sampleVote: ActiveVote = {
      id: this.currentVoteId++,
      title: "Chat History Retention",
      description: "Implement automatic chat history retention of 90 days for all messages, with option for users to export their message history.",
      proposedBy: 1,
      yesVotes: 8,
      noVotes: 4,
      totalVotesNeeded: 20,
      endsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
      createdAt: new Date(),
    };
    this.activeVotes.set(sampleVote.id, sampleVote);

    // Initialize default access codes for testing
    const testAccessCodes = [
      { code: "3.4.12", createdBy: 1, isActive: true },
      { code: "333", createdBy: 1, isActive: true },
      { code: "444", createdBy: 1, isActive: true },
      { code: "555", createdBy: 1, isActive: true },
      { code: "777", createdBy: 1, isActive: true }
    ];

    testAccessCodes.forEach(codeData => {
      const accessCode: AccessCode = {
        id: this.currentAccessCodeId++,
        code: codeData.code,
        createdBy: codeData.createdBy,
        isActive: codeData.isActive,
        createdAt: new Date(),
      };
      this.accessCodes.set(codeData.code, accessCode);
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  async getUserCount(): Promise<number> {
    return this.users.size;
  }

  async createUser(insertUser: CreateUser): Promise<User> {
    const id = this.currentUserId++;
    // First user gets rank 0 (Admin), others get default rank 10
    const rank = this.users.size === 0 ? 0 : (insertUser.rank ?? 10);
    const user: User = {
      id,
      username: insertUser.username,
      email: insertUser.email,
      passwordHash: insertUser.passwordHash || null,
      firstName: insertUser.firstName || null,
      lastName: insertUser.lastName || null,
      accountType: insertUser.accountType || "full",
      accessCode: insertUser.accessCode || null,
      rank,
      isOnline: true,
      joinedAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  async updateUserRank(userId: number, newRank: number): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;
    
    const updatedUser: User = { ...user, rank: newRank };
    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  async updateUserAccessCode(userId: number, accessCode: string): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;
    
    const updatedUser: User = { ...user, accessCode };
    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  async setUserOnlineStatus(userId: number, isOnline: boolean): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      const updatedUser: User = { ...user, isOnline };
      this.users.set(userId, updatedUser);
    }
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async getOnlineUsers(): Promise<User[]> {
    return Array.from(this.users.values()).filter(user => user.isOnline);
  }

  async getOnlineUsersByAccessCode(accessCode: string | null): Promise<User[]> {
    return Array.from(this.users.values()).filter(user => {
      if (!user.isOnline) return false;
      
      // If requesting user has full account
      if (accessCode === null) {
        // Full account users can see other full accounts and code "3.4.12" users
        return user.accountType === "full" || (user.accountType === "code" && user.accessCode === "3.4.12");
      }
      
      // If requesting user has code account
      if (accessCode === "3.4.12") {
        // Code "3.4.12" users can see full accounts and other "3.4.12" users
        return user.accountType === "full" || (user.accountType === "code" && user.accessCode === "3.4.12");
      }
      
      // Other code users can only see users with the exact same access code
      return user.accountType === "code" && user.accessCode === accessCode;
    });
  }

  async getAccessCodeByCode(code: string): Promise<AccessCode | undefined> {
    return this.accessCodes.get(code);
  }

  async createAccessCode(accessCodeData: { code: string; createdBy: number; isActive: boolean }): Promise<AccessCode> {
    // Check if code already exists
    if (this.accessCodes.has(accessCodeData.code)) {
      throw new Error("Access code already exists");
    }
    
    const id = this.currentAccessCodeId++;
    const accessCode: AccessCode = {
      id,
      code: accessCodeData.code,
      createdBy: accessCodeData.createdBy,
      isActive: accessCodeData.isActive,
      createdAt: new Date(),
    };
    this.accessCodes.set(accessCodeData.code, accessCode);
    return accessCode;
  }

  async getAllAccessCodes(): Promise<AccessCode[]> {
    return Array.from(this.accessCodes.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async createMessage(insertMessage: InsertMessage): Promise<MessageWithUser> {
    const user = this.users.get(insertMessage.userId);
    if (!user) throw new Error("User not found");

    // Nettoyer les anciens messages (plus de 7 jours)
    await this.cleanupOldMessages();

    const id = this.currentMessageId++;
    const message: Message = {
      ...insertMessage,
      id,
      createdAt: new Date(),
    };

    const messageWithUser: MessageWithUser = {
      ...message,
      user,
    };

    this.messages.set(id, messageWithUser);
    return messageWithUser;
  }

  // Nettoyer les messages de plus de 7 jours
  async cleanupOldMessages(): Promise<void> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const messagesToDelete: number[] = [];
    
    // Convertir en array pour éviter l'erreur TypeScript
    const messagesArray = Array.from(this.messages.entries());
    for (const [id, message] of messagesArray) {
      if (message.createdAt < sevenDaysAgo) {
        messagesToDelete.push(id);
      }
    }
    
    for (const id of messagesToDelete) {
      this.messages.delete(id);
    }
  }

  // Obtenir tous les messages d'un utilisateur des 7 derniers jours
  async getUserMessages(userId: number): Promise<MessageWithUser[]> {
    const messages = Array.from(this.messages.values());
    
    // Filtrer les messages de l'utilisateur
    const userMessages = messages.filter(message => message.userId === userId);
    
    // Trier par date (plus récent en dernier)
    return userMessages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async getRecentMessages(limit: number = 50): Promise<MessageWithUser[]> {
    const messages = Array.from(this.messages.values());
    return messages
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(-limit);
  }

  async getRecentMessagesByAccessCode(accessCode: string | null, limit: number = 50): Promise<MessageWithUser[]> {
    const messages = Array.from(this.messages.values());
    
    // Filter messages based on access code
    const filteredMessages = messages.filter(message => {
      const messageUser = message.user;
      
      // If requesting user has full account
      if (accessCode === null) {
        // Full account users can see messages from other full accounts and code "3.4.12" users
        return messageUser.accountType === "full" || (messageUser.accountType === "code" && messageUser.accessCode === "3.4.12");
      }
      
      // If requesting user has code account
      if (accessCode === "3.4.12") {
        // Code "3.4.12" users can see messages from full accounts and other "3.4.12" users
        return messageUser.accountType === "full" || (messageUser.accountType === "code" && messageUser.accessCode === "3.4.12");
      }
      
      // Other code users can only see messages from users with the exact same access code
      return messageUser.accountType === "code" && messageUser.accessCode === accessCode;
    });
    
    return filteredMessages
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(-limit);
  }

  async getLaws(): Promise<Law[]> {
    return Array.from(this.laws.values())
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async createLaw(insertLaw: InsertLaw): Promise<Law> {
    const id = this.currentLawId++;
    const law: Law = {
      ...insertLaw,
      id,
      status: "active",
      passedVotes: 0,
      totalVotes: 0,
      createdAt: new Date(),
    };
    this.laws.set(id, law);
    return law;
  }

  async getActiveVotes(): Promise<ActiveVote[]> {
    return Array.from(this.activeVotes.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async createActiveVote(insertVote: InsertActiveVote): Promise<ActiveVote> {
    const id = this.currentVoteId++;
    const vote: ActiveVote = {
      ...insertVote,
      id,
      yesVotes: 0,
      noVotes: 0,
      totalVotesNeeded: 20,
      createdAt: new Date(),
    };
    this.activeVotes.set(id, vote);
    return vote;
  }

  async castVote(userId: number, voteId: number, vote: "yes" | "no"): Promise<boolean> {
    const key = `${userId}-${voteId}`;
    if (this.activeVoteUsers.has(key)) {
      return false; // Already voted
    }

    this.activeVoteUsers.set(key, { userId, voteId, vote });

    const activeVote = this.activeVotes.get(voteId);
    if (activeVote) {
      const updatedVote = {
        ...activeVote,
        yesVotes: vote === "yes" ? activeVote.yesVotes + 1 : activeVote.yesVotes,
        noVotes: vote === "no" ? activeVote.noVotes + 1 : activeVote.noVotes,
      };
      this.activeVotes.set(voteId, updatedVote);
    }

    return true;
  }

  async hasUserVoted(userId: number, voteId: number): Promise<boolean> {
    const key = `${userId}-${voteId}`;
    return this.activeVoteUsers.has(key);
  }

  async getVoteResults(voteId: number): Promise<{ yes: number; no: number; total: number }> {
    const vote = this.activeVotes.get(voteId);
    if (!vote) return { yes: 0, no: 0, total: 0 };
    
    return {
      yes: vote.yesVotes,
      no: vote.noVotes,
      total: vote.yesVotes + vote.noVotes,
    };
  }
}

export const storage = new MemStorage();
