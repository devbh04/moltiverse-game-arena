# moltiverse-game-arena

A multiplayer game platform featuring Chess, Rock Paper Scissors, and Tic Tac Toe.

### Chess
- Play against other users in real-time
- Spectate and chat in ongoing games
- Resign and offer/accept draws mid-game
- _Optional_ user accounts for tracking stats and game history

### Rock Paper Scissors
- Best of 3 rounds with a 3-second pick timer
- Auto-random pick on timeout
- Continue or end session after each match

### Tic Tac Toe
- Standard 3×3 grid with a 5-second turn timer
- Auto-random placement on timeout
- Continue or end session after each match

All games are mobile-friendly and support spectating.

Built with Next.js 15, React 19, Tailwind CSS + daisyUI, react-chessboard, chess.js, Express.js 5, socket.io and PostgreSQL.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 19, Tailwind CSS 3, daisyUI 4 |
| Backend | Express.js 5, socket.io |
| Database | PostgreSQL 17 |
| Language | TypeScript 5.9 |
| Package Manager | pnpm (workspaces) |

## Project Structure

This project is structured as a monorepo using **pnpm** workspaces, separated into three packages:

- `client` — Next.js app for the front-end (port **3000**)
- `server` — Express.js app for the back-end API + WebSocket (port **3001**)
- `types` — Shared TypeScript type definitions used by client and server

## Getting Started (Local Setup)

### Prerequisites

- **Node.js** 20 or newer
- **pnpm** — install via `npm install -g pnpm` or see [pnpm.io](https://pnpm.io/installation)
- **PostgreSQL** — install via Homebrew (macOS) or your system's package manager

### 1. Install PostgreSQL

**macOS (Homebrew):**
```sh
brew install postgresql@17
brew services start postgresql@17
```

**Ubuntu/Debian:**
```sh
sudo apt install postgresql
sudo systemctl start postgresql
```

### 2. Create the Database

```sh
# macOS (Homebrew) — use the full path if pg tools aren't in PATH
/opt/homebrew/opt/postgresql@17/bin/createuser -s chessu_user
/opt/homebrew/opt/postgresql@17/bin/psql -d postgres -c "ALTER USER chessu_user WITH PASSWORD 'chessu_pass';"
/opt/homebrew/opt/postgresql@17/bin/createdb -O chessu_user chessu
```

Or using `psql` directly (if already in PATH):
```sh
createuser -s chessu_user
psql -d postgres -c "ALTER USER chessu_user WITH PASSWORD 'chessu_pass';"
createdb -O chessu_user chessu
```

### 3. Configure Environment Variables

Create a `.env` file inside the `server/` directory:

```env
PGHOST=localhost
PGUSER=chessu_user
PGPASSWORD=chessu_pass
PGDATABASE=chessu
PGPORT=5432
SESSION_SECRET=your-secret-here
```

### 4. Install Dependencies

From the root of the project:
```sh
pnpm install
```

> **Note:** If prompted to approve build scripts for native modules (argon2, bufferutil, etc.), run `pnpm approve-builds`, select all, and approve.

### 5. Run the Development Servers

```sh
pnpm dev
```

This starts both the client and server concurrently:
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:3001

You can also run them separately:
```sh
pnpm dev:client   # frontend only
pnpm dev:server   # backend only
```

### 6. Build for Production

```sh
pnpm build:client
pnpm build:server
pnpm start         # starts both in production mode
```

## Available Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start both client + server in dev mode |
| `pnpm dev:client` | Start only the frontend |
| `pnpm dev:server` | Start only the backend |
| `pnpm build:client` | Build the Next.js client |
| `pnpm build:server` | Build the Express server (tsc) |
| `pnpm start` | Start both in production mode |
| `pnpm lint` | Run ESLint across the project |
| `pnpm format` | Format code with Prettier |

