# SuiteTalk - Multi-Tenant AI Voice Concierge for Hospitality

SuiteTalk is a modern, on-premise and hybrid-SaaS AI voice assistant platform designed for the hospitality industry. It integrates physical hotel rooms and internal analog telephone lines (via Asterisk) with Google Gemini's Multimodal Live API. Guests speak naturally with the AI to request services, kitchen orders, housekeeping, or FAQ queries, which are logged in real-time onto a staff command dashboard.

---

## 🛠️ Architecture Overview

SuiteTalk consists of three main components working in absolute tenant isolation:

1. **Telephony Bridge (Asterisk PBX):**
   - Configured inside Linux (or WSL) using PJSIP.
   - Routes dialing `0` to the Stasis application (`suitetalk`), establishing an `AudioSocket` connection to steam raw PCM audio to the backend.
   - Scopes calls dynamically by parsing caller extensions (e.g., `1_101` for Hotel 1, Room 101) or Asterisk context names.

2. **Backend Engine (Node.js + TypeScript):**
   - Connects to Asterisk via **AMI** (port 5038) and **ARI** (port 8088).
   - Manages the WebSocket-based `AudioSocket` server (port 9092) and downsamples/upsamples audio streams to talk to the Gemini Multimodal Live API.
   - Employs **Google Gemini** equipped with specialized tools that execute queries and log guest service requests into the local database.

3. **Staff Dashboard (Next.js + React):**
   - High-fidelity, premium dark-themed command center built with Tailwind CSS.
   - Provides live request queues, real-time AI-guest conversation logs, room directories, and device setup simulator panels.
   - Enforces strict Role-Based Access Control (RBAC) across `OWNER`, `MANAGER`, and `STAFF`.

---

## 📁 Directory Structure

```
SuiteTalk/
├── backend/                  # Node.js + TS Backend
│   ├── prisma/               # Database schemas and migrations
│   └── src/                  # Audio bridge, PMS integrations, and AI engine
├── dashboard/                # Next.js Frontend App
│   ├── public/               # Static assets
│   └── src/app/              # Pages, Layouts, and components
├── extensions.conf           # Local Asterisk extensions config (Excluded)
├── pjsip.conf                # Local PJSIP endpoints config (Excluded)
├── README.md                 # Project documentation
└── GEMINI.md                 # Agent instructions
```

---

## ⚙️ Technical Requirements & Setup

### Prerequisites
- **Node.js** v20+
- **PostgreSQL** with `pgvector` extension installed
- **Asterisk PBX** installed (v18+) with `app_audiosocket` and `res_audiosocket` loaded

### 1. Database Setup
1. Create a PostgreSQL database (e.g., `suitetalk`).
2. Configure the database connection string in `backend/.env`:
   ```env
   DATABASE_URL="postgresql://username:password@localhost:5432/suitetalk?schema=public"
   GEMINI_API_KEY="your-gemini-live-api-key"
   ```
3. Run migrations and generate the client:
   ```bash
   cd backend
   npx prisma db push
   ```
4. Seed the default database properties and staff:
   ```bash
   npm run build
   npx tsx src/stage_seeding.ts
   npx tsx src/seed_new_hotel.ts
   ```

### 2. Running the Backend
```bash
cd backend
npm install
npm run build
npm run start
```
The server will start listening for:
- API requests on port **3001**
- AudioSocket connections on port **9092**

### 3. Running the Next.js Dashboard
```bash
cd dashboard
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to access the dashboard.

---

## 🧪 Simulation and Testing

1. Log in using a pre-seeded tenant owner account:
   - **Hotel 1 (The Grand Suite):** `owner@grandsuite.com` (password: `admin123`)
   - **Hotel 2 (Royal Palms Resort):** `owner@royalpalms.com` (password: `palms123`)
2. Go to the **Guest Simulator** page on the sidebar.
3. Choose a room and simulate voice audio or text prompts.
4. Verify that requests populate real-time in the **Requests Queue** list under that tenant property.