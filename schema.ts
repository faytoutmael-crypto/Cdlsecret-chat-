import { pgTable, text, serial, integer, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"), // null for code-based users
  firstName: text("first_name"),
  lastName: text("last_name"),
  accountType: text("account_type").notNull().default("full"), // "full" or "code"
  accessCode: text("access_code"), // stores the code used for code-based access
  rank: integer("rank").notNull().default(10),
  isOnline: boolean("is_online").notNull().default(false),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const laws = pgTable("laws", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("active"), // active, archived
  passedVotes: integer("passed_votes").notNull().default(0),
  totalVotes: integer("total_votes").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const votes = pgTable("votes", {
  id: serial("id").primaryKey(),
  lawId: integer("law_id").references(() => laws.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  vote: text("vote").notNull(), // yes, no
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const activeVotes = pgTable("active_votes", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  proposedBy: integer("proposed_by").references(() => users.id).notNull(),
  yesVotes: integer("yes_votes").notNull().default(0),
  noVotes: integer("no_votes").notNull().default(0),
  totalVotesNeeded: integer("total_votes_needed").notNull().default(20),
  endsAt: timestamp("ends_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const activeVoteUsers = pgTable("active_vote_users", {
  id: serial("id").primaryKey(),
  voteId: integer("vote_id").references(() => activeVotes.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  vote: text("vote").notNull(), // yes, no
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const accessCodes = pgTable("access_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  createdBy: integer("created_by").references(() => users.id).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Schema exports for API
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  isOnline: true,
  joinedAt: true,
});

// Schema for internal user creation (includes passwordHash)
export const createUserSchema = createInsertSchema(users).omit({
  id: true,
  isOnline: true,
  joinedAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

// Schema for message content only (used by frontend)
export const messageContentSchema = z.object({
  content: z.string().min(1, "Le contenu du message est requis").trim(),
});

export const insertLawSchema = createInsertSchema(laws).omit({
  id: true,
  status: true,
  passedVotes: true,
  totalVotes: true,
  createdAt: true,
});

export const insertActiveVoteSchema = createInsertSchema(activeVotes).omit({
  id: true,
  yesVotes: true,
  noVotes: true,
  totalVotesNeeded: true,
  createdAt: true,
});

export const registerSchema = z.object({
  username: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  confirmPassword: z.string().min(6),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const codeAccessSchema = z.object({
  code: z.string().min(1),
  username: z.string().min(1),
  email: z.string().email(),
});

export const insertAccessCodeSchema = createInsertSchema(accessCodes).omit({
  id: true,
  createdAt: true,
});

export const createCodeSchema = z.object({
  code: z.string().min(1).max(20, "Code too long"),
});

export const oldLoginSchema = z.object({
  code: z.string().min(1, "Access code is required"),
  username: z.string().min(1, "Username is required").max(50, "Username too long"),
});

export const voteSchema = z.object({
  voteId: z.number(),
  vote: z.enum(["yes", "no"]),
});

export const updateRankSchema = z.object({
  userId: z.number(),
  newRank: z.number().min(0).max(10),
  reason: z.string().optional(),
});

// Base types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type CreateUser = z.infer<typeof createUserSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Law = typeof laws.$inferSelect;
export type InsertLaw = z.infer<typeof insertLawSchema>;
export type ActiveVote = typeof activeVotes.$inferSelect;
export type InsertActiveVote = z.infer<typeof insertActiveVoteSchema>;
export type AccessCode = typeof accessCodes.$inferSelect;

// Authentication types
export type RegisterData = z.infer<typeof registerSchema>;
export type LoginData = z.infer<typeof loginSchema>;
export type CodeAccessData = z.infer<typeof codeAccessSchema>;
export type CreateCodeData = z.infer<typeof createCodeSchema>;

// Legacy types
export type LoginRequest = z.infer<typeof oldLoginSchema>;
export type VoteRequest = z.infer<typeof voteSchema>;
export type UpdateRankRequest = z.infer<typeof updateRankSchema>;

export interface MessageWithUser extends Message {
  user: User;
}

export interface UserWithMessages extends User {
  messages: Message[];
}
