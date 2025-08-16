# replit.md

## Overview

This is a full-stack chat application with voting functionality built using modern web technologies. The application features real-time messaging, user authentication, law proposal/voting system, and rank-based permissions. It follows a client-server architecture with WebSocket support for real-time features.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized builds
- **Styling**: Tailwind CSS with shadcn/ui component library
- **State Management**: TanStack Query (React Query) for server state
- **Routing**: Wouter for lightweight client-side routing
- **Real-time**: WebSocket client for live updates
- **UI Components**: Radix UI primitives with custom styling

### Backend Architecture
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js for REST API
- **Real-time**: WebSocket Server for live messaging and updates
- **Database**: PostgreSQL with Drizzle ORM
- **Validation**: Zod for runtime type checking
- **Authentication**: Session-based with localStorage persistence

### Database Design
- **ORM**: Drizzle ORM with TypeScript-first approach
- **Schema**: Shared between client and server (`shared/schema.ts`)
- **Tables**: Users, Messages, Laws, Votes, Active Votes, Active Vote Users
- **Features**: Auto-incrementing IDs, timestamps, foreign key relationships

## Key Components

### Authentication System
- Multiple authentication paths:
  1. Full account creation → Code verification → Chat access
  2. Direct code access with limited privileges
  3. Traditional login for existing accounts
- Rank-based permissions (0=Admin, 10=Default)
- Persistent sessions via localStorage
- Real-time online status tracking
- Sequential user onboarding with clear separation of account and community access

### Chat System
- Real-time messaging via WebSocket
- Access code-based channel isolation (each code creates separate chat room)
- Message history with user details filtered by access code
- Online user list with rank display, filtered by access code
- Auto-scroll to latest messages
- Full accounts and "3.4.12" users share a common channel
- All other access codes create completely isolated channels

### Voting System
- Law proposal creation by users
- Active voting with yes/no options
- Vote tallying and results
- Time-limited voting periods
- Historical law storage

### Administrative Features
- Rank management for admins
- User status monitoring
- Vote result oversight
- 7-day message history access for each user
- Clickable usernames to view complete message logs
- Automatic message cleanup after 7 days
- Comprehensive user activity tracking

## Data Flow

1. **Authentication**: 
   - Full Account: Account creation → Code verification → Session established
   - Code Access: Direct code/username → Session established  
   - Login: Username/password → Session established
2. **WebSocket Connection**: Authenticated users connect via WebSocket for real-time features
3. **Messaging**: Messages sent via WebSocket → Broadcast to users with same access code → Persist to database
4. **Voting**: Proposals created via REST API → Real-time updates via WebSocket → Results calculated server-side
5. **User Management**: Admin actions via REST API → Real-time status updates via WebSocket

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: PostgreSQL database driver
- **drizzle-orm**: Type-safe ORM
- **@tanstack/react-query**: Server state management
- **ws**: WebSocket implementation
- **express**: Web framework
- **zod**: Runtime validation

### UI Dependencies
- **@radix-ui/react-***: Accessible UI primitives
- **tailwindcss**: Utility-first CSS framework
- **class-variance-authority**: Component variant handling
- **lucide-react**: Icon library

### Development Dependencies
- **vite**: Build tool and dev server
- **typescript**: Type checking
- **tsx**: TypeScript execution

## Deployment Strategy

### Development Environment
- **Command**: `npm run dev`
- **Server**: Express with Vite middleware for HMR
- **Port**: 5000 (configurable)
- **Database**: PostgreSQL via environment variable

### Production Build
- **Build Command**: `npm run build`
- **Output**: 
  - Client: `dist/public` (Vite build)
  - Server: `dist/index.js` (esbuild bundle)
- **Start Command**: `npm run start`
- **Environment**: NODE_ENV=production

### Database Management
- **Migrations**: `npm run db:push` (Drizzle Kit)
- **Schema**: Located in `shared/schema.ts`
- **Connection**: PostgreSQL via DATABASE_URL environment variable

### Replit Configuration
- **Modules**: nodejs-20, web, postgresql-16
- **Deployment**: Autoscale target
- **Build Process**: npm run build
- **Runtime**: npm run start

## Changelog
- June 24, 2025. Initial setup and complete implementation
- June 24, 2025. Successfully deployed hierarchical chat platform with:
  - Code-based authentication (3.4.12)
  - Real-time messaging via WebSocket
  - Rank-based permission system (0-10)
  - Laws and voting governance system
  - Discord-like dark theme UI
  - Admin rank modification capabilities
- August 11, 2025. Complete French localization implementation:
  - All authentication interfaces translated to French
  - Chat interface and user messages in French
  - Fixed session management and registration bugs
  - Verified dual authentication system (accounts + code access)
  - First registered user automatically receives Admin rank (0)
  - Registration, login, and code access fully functional
- August 11, 2025. Deployment configuration fixes:
  - Updated port configuration to use environment PORT variable for deployment
  - Modified session secret to use SESSION_SECRET environment variable
  - Fixed legacy login endpoint schema and user creation requirements
  - Resolved TypeScript compilation errors for production deployment
  - Application now supports both development (port 5000) and production (environment PORT) configurations
- August 11, 2025. Autoscale deployment preparation:
  - Removed hardcoded session secret fallback - now requires SESSION_SECRET environment variable
  - Ready for port configuration update in .replit file (localPort 5000 → externalPort 80)
  - Application configured to use environment PORT variable for deployment compatibility
- August 11, 2025. Enhanced administrative features and voting system restrictions:
  - Added comprehensive user management system for administrators (rank 0)
  - New route `/api/users/all` allows admins to view all registered users
  - Added UsersModal component displaying complete user list with account types and rank information
  - Implemented voting restrictions: only full accounts and users with access code "3.4.12" can vote
  - Updated laws modal interface to show voting eligibility status and restrictions
  - French localization maintained throughout new features
- August 11, 2025. Access code-based chat channel isolation implementation:
  - Implemented complete message separation by access code creating isolated chat channels
  - Users with code "333" only see messages from other "333" users
  - Users with code "444" only see messages from other "444" users  
  - Full accounts and "3.4.12" code users can interact with each other (shared channel)
  - Online user lists filtered by access code for complete channel isolation
  - WebSocket broadcasts (messages, user status) respect access code boundaries
  - Each access code now functions as a completely separate chat room
  - Enhanced storage methods with `getRecentMessagesByAccessCode` and `getOnlineUsersByAccessCode`
- August 11, 2025. New account creation workflow implementation:
  - Created new sequential account creation page (/account-creation) 
  - Two-step process: 1) Create full account, 2) Enter access code
  - Users create account first, then join specific communities via access codes
  - Separated account creation from simple code access for clearer user flow
  - Maintained existing code-only access for lightweight entry (/code-access)
  - Complete mobile responsiveness with hamburger menu and sliding sidebar
  - Fixed all JSX structure issues in chat interface for proper mobile display
- August 11, 2025. Enhanced sequential authentication flow:
  - Created separate code verification page (/code-verification) after account creation
  - Three-step process: Account Creation → Code Verification → Chat Access
  - Code verification page allows entering existing codes OR creating new codes
  - User data persistence between pages using localStorage
  - Clear separation between account creation and community access
  - Maintained option for quick code-only access for users without full accounts
- August 11, 2025. Database and system infrastructure fixes:
  - Resolved PostgreSQL connection issues with new database instance
  - Fixed WebSocket authentication and real-time communication errors
  - Successfully deployed schema with drizzle-kit push
  - All authentication flows now working properly (account creation, code verification, login)
  - Application fully operational with complete French localization
- August 11, 2025. Complete system validation and final deployment readiness:
  - Fixed all TypeScript compilation errors in chat component
  - Corrected API request patterns to use proper apiRequest function calls
  - Added credentials: "include" to all fetch requests for proper session management
  - Updated routing to direct homepage (/) to account creation flow
  - Validated end-to-end functionality: account creation → code verification → chat access
  - WebSocket real-time communication fully functional with proper user authentication
  - Confirmed isolated chat channels working properly (different access codes = separate channels)
  - Application successfully tested with multiple users and access codes
  - System ready for production deployment
- August 12, 2025. Advanced message management and administrative oversight system:
  - Implemented 7-day message retention system with automatic cleanup
  - Added comprehensive user message history functionality for administrators
  - Created UserMessagesModal component for detailed message viewing
  - Integrated clickable usernames for administrators to view complete message history
  - Enhanced admin privileges with granular message oversight capabilities
  - Added message analytics and user activity tracking (7-day window)
  - Implemented automatic cleanup system to maintain performance and storage efficiency
  - Created intuitive interface for administrators to monitor user communications
  - All changes maintain existing French localization and Discord-like UI consistency

## User Preferences

Preferred communication style: Simple, everyday language (French).
Preferred interface language: French.
Project confirmed as meeting user requirements - ready for deployment.