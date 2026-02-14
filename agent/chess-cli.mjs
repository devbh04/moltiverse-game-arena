#!/usr/bin/env node
/**
 * Moltiverse Chess CLI - Atomic commands for OpenClaw agents
 * 
 * Usage:
 *   node chess-cli.mjs auth <name>           - Authenticate as guest
 *   node chess-cli.mjs create [side]         - Create new game (white/black/random)
 *   node chess-cli.mjs join <code>           - Join existing game
 *   node chess-cli.mjs state <code>          - Get game state
 *   node chess-cli.mjs moves <code>          - Get legal moves
 *   node chess-cli.mjs move <code> <move>    - Make a move (e.g., e2e4 or Nf3)
 *   node chess-cli.mjs list                  - List available games
 */

import { Chess } from "chess.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_URL = process.env.GAME_API_URL || "http://localhost:3001";
const SESSION_FILE = path.join(__dirname, ".chess-session.json");

// Session management
function loadSession() {
    try {
        if (fs.existsSync(SESSION_FILE)) {
            return JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
        }
    } catch (e) {}
    return { cookie: null, name: null };
}

function saveSession(session) {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2));
}

// API helper
async function apiRequest(endpoint, method = "GET", body = null) {
    const session = loadSession();
    const headers = {
        "Content-Type": "application/json"
    };
    if (session.cookie) {
        headers["Cookie"] = session.cookie;
    }

    const options = { method, headers };
    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_URL}${endpoint}`, options);
    
    // Capture session cookie
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
        session.cookie = setCookie.split(";")[0];
        saveSession(session);
    }

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
}

// Commands
async function authenticate(name) {
    try {
        await apiRequest("/v1/auth/guest", "POST", { name });
        const session = loadSession();
        session.name = name;
        saveSession(session);
        console.log(JSON.stringify({ 
            success: true, 
            message: `Authenticated as ${name}` 
        }));
    } catch (error) {
        console.log(JSON.stringify({ 
            success: false, 
            error: error.message 
        }));
        process.exit(1);
    }
}

async function createGame(side = "random") {
    try {
        const result = await apiRequest("/v1/games", "POST", { side });
        console.log(JSON.stringify({
            success: true,
            code: result.code,
            side: side,
            url: `http://localhost:3000/${result.code}`,
            message: `Game created! Code: ${result.code}. Share URL or wait for opponent.`
        }));
    } catch (error) {
        console.log(JSON.stringify({ 
            success: false, 
            error: error.message 
        }));
        process.exit(1);
    }
}

async function joinGame(code) {
    try {
        // First check if game exists
        const game = await apiRequest(`/v1/games/${code}`);
        if (!game) throw new Error("Game not found");
        
        const session = loadSession();
        const myName = session.name || "Unknown";
        
        // Determine available slot
        let availableSide = null;
        if (!game.white) availableSide = "white";
        else if (!game.black) availableSide = "black";
        
        // If there's an open slot, join the game
        if (availableSide) {
            const joinResult = await apiRequest(`/v1/games/${code}/join`, "POST", {});
            
            console.log(JSON.stringify({
                success: true,
                code: game.code,
                joinedAs: joinResult.joinedAs,
                white: joinResult.game?.white || game.white?.name || null,
                black: joinResult.game?.black || game.black?.name || null,
                message: `Joined game ${code} as ${joinResult.joinedAs}!`
            }));
        } else {
            console.log(JSON.stringify({
                success: true,
                code: game.code,
                white: game.white?.name || null,
                black: game.black?.name || null,
                availableSide: null,
                message: `Game ${code} is full. You can spectate.`
            }));
        }
    } catch (error) {
        console.log(JSON.stringify({ 
            success: false, 
            error: error.message 
        }));
        process.exit(1);
    }
}

async function getGameState(code) {
    try {
        const game = await apiRequest(`/v1/games/${code}`);
        if (!game) throw new Error("Game not found");
        
        const chess = new Chess();
        if (game.pgn) chess.loadPgn(game.pgn);
        
        const turn = chess.turn() === "w" ? "white" : "black";
        let status = "in_progress";
        if (chess.isCheckmate()) status = "checkmate";
        else if (chess.isStalemate()) status = "stalemate";
        else if (chess.isDraw()) status = "draw";
        else if (chess.isCheck()) status = "check";
        
        console.log(JSON.stringify({
            success: true,
            code: game.code,
            white: game.white?.name || null,
            black: game.black?.name || null,
            turn: turn,
            status: status,
            moveCount: chess.history().length,
            fen: chess.fen(),
            lastMoves: chess.history().slice(-5),
            ascii: chess.ascii()
        }));
    } catch (error) {
        console.log(JSON.stringify({ 
            success: false, 
            error: error.message 
        }));
        process.exit(1);
    }
}

async function getLegalMoves(code) {
    try {
        const game = await apiRequest(`/v1/games/${code}`);
        if (!game) throw new Error("Game not found");
        
        const chess = new Chess();
        if (game.pgn) chess.loadPgn(game.pgn);
        
        const moves = chess.moves({ verbose: true });
        
        // Group by piece
        const byPiece = {};
        moves.forEach(m => {
            const key = `${m.piece.toUpperCase()}@${m.from}`;
            if (!byPiece[key]) byPiece[key] = [];
            byPiece[key].push({
                to: m.to,
                san: m.san,
                capture: m.captured || null
            });
        });
        
        const captures = moves.filter(m => m.captured).map(m => m.san);
        
        console.log(JSON.stringify({
            success: true,
            code: code,
            turn: chess.turn() === "w" ? "white" : "black",
            totalMoves: moves.length,
            moves: byPiece,
            captures: captures,
            allMovesSAN: moves.map(m => m.san)
        }));
    } catch (error) {
        console.log(JSON.stringify({ 
            success: false, 
            error: error.message 
        }));
        process.exit(1);
    }
}

async function makeMove(code, moveStr) {
    try {
        // Get current game state first to validate
        const game = await apiRequest(`/v1/games/${code}`);
        if (!game) throw new Error("Game not found");
        
        const chess = new Chess();
        if (game.pgn) chess.loadPgn(game.pgn);
        
        // Parse and validate move locally
        let moveObj;
        if (moveStr.length === 4 || moveStr.length === 5) {
            // Coordinate notation: e2e4, e7e8q
            moveObj = {
                from: moveStr.slice(0, 2),
                to: moveStr.slice(2, 4),
                promotion: moveStr.length === 5 ? moveStr[4] : undefined
            };
        } else {
            // SAN notation - convert to from/to
            const testMove = chess.move(moveStr);
            if (!testMove) throw new Error(`Invalid move: ${moveStr}`);
            chess.undo();
            moveObj = { from: testMove.from, to: testMove.to, promotion: testMove.promotion };
        }
        
        // Use REST API to make the move
        const result = await apiRequest(`/v1/games/${code}/move`, "POST", moveObj);
        
        if (!result.success) {
            throw new Error(result.error || "Move failed");
        }

        // Get updated position
        const updatedChess = new Chess();
        updatedChess.load(result.fen);
        
        console.log(JSON.stringify({
            success: true,
            move: result.move,
            from: result.from,
            to: result.to,
            fen: result.fen,
            gameOver: result.gameOver,
            ascii: updatedChess.ascii()
        }));
    } catch (error) {
        console.log(JSON.stringify({ 
            success: false, 
            error: error.message 
        }));
        process.exit(1);
    }
}

async function listGames() {
    try {
        const games = await apiRequest("/v1/games");
        
        const gameList = (games || []).map(g => ({
            code: g.code,
            white: g.white?.name || null,
            black: g.black?.name || null,
            hasOpenSlot: !g.white || !g.black,
            moveCount: g.pgn ? new Chess(g.pgn).history().length : 0
        }));

        console.log(JSON.stringify({
            success: true,
            count: gameList.length,
            games: gameList
        }));
    } catch (error) {
        console.log(JSON.stringify({ 
            success: false, 
            error: error.message 
        }));
        process.exit(1);
    }
}

async function joinQueue() {
    try {
        const result = await apiRequest("/v1/games/queue", "POST");
        
        if (result.matched) {
            console.log(JSON.stringify({
                success: true,
                matched: true,
                code: result.code,
                color: result.color,
                opponent: result.opponent,
                message: `Matched! Game code: ${result.code}, playing as ${result.color}`
            }));
        } else {
            console.log(JSON.stringify({
                success: true,
                matched: false,
                position: result.position,
                message: `Waiting in queue at position ${result.position}. Poll GET /v1/games/queue for status.`
            }));
        }
    } catch (error) {
        console.log(JSON.stringify({ 
            success: false, 
            error: error.message 
        }));
        process.exit(1);
    }
}

async function getQueueStatus() {
    try {
        const result = await apiRequest("/v1/games/queue", "GET");
        console.log(JSON.stringify({
            success: true,
            ...result
        }));
    } catch (error) {
        console.log(JSON.stringify({ 
            success: false, 
            error: error.message 
        }));
        process.exit(1);
    }
}

async function leaveQueue() {
    try {
        const result = await apiRequest("/v1/games/queue", "DELETE");
        console.log(JSON.stringify({
            success: true,
            message: "Left matchmaking queue"
        }));
    } catch (error) {
        console.log(JSON.stringify({ 
            success: false, 
            error: error.message 
        }));
        process.exit(1);
    }
}

// Main CLI
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
    case "auth":
        if (!args[1]) {
            console.log(JSON.stringify({ success: false, error: "Name required. Usage: auth <name>" }));
            process.exit(1);
        }
        await authenticate(args[1]);
        break;
        
    case "create":
        await createGame(args[1] || "random");
        break;
        
    case "join":
        if (!args[1]) {
            console.log(JSON.stringify({ success: false, error: "Game code required. Usage: join <code>" }));
            process.exit(1);
        }
        await joinGame(args[1]);
        break;
        
    case "state":
        if (!args[1]) {
            console.log(JSON.stringify({ success: false, error: "Game code required. Usage: state <code>" }));
            process.exit(1);
        }
        await getGameState(args[1]);
        break;
        
    case "moves":
        if (!args[1]) {
            console.log(JSON.stringify({ success: false, error: "Game code required. Usage: moves <code>" }));
            process.exit(1);
        }
        await getLegalMoves(args[1]);
        break;
        
    case "move":
        if (!args[1] || !args[2]) {
            console.log(JSON.stringify({ success: false, error: "Usage: move <code> <move>" }));
            process.exit(1);
        }
        await makeMove(args[1], args[2]);
        break;
        
    case "list":
        await listGames();
        break;
    
    case "queue":
        const queueAction = args[1] || "join";
        if (queueAction === "join") {
            await joinQueue();
        } else if (queueAction === "status") {
            await getQueueStatus();
        } else if (queueAction === "leave") {
            await leaveQueue();
        } else {
            console.log(JSON.stringify({ 
                success: false, 
                error: `Unknown queue action: ${queueAction}. Use: join, status, leave` 
            }));
            process.exit(1);
        }
        break;
        
    default:
        console.log(JSON.stringify({
            success: false,
            error: "Unknown command",
            usage: {
                auth: "auth <name> - Authenticate as guest",
                create: "create [white|black|random] - Create new game",
                join: "join <code> - Join existing game",
                queue: "queue [join|status|leave] - Matchmaking queue",
                state: "state <code> - Get game state",
                moves: "moves <code> - Get legal moves",
                move: "move <code> <move> - Make a move",
                list: "list - List available games"
            }
        }));
        process.exit(1);
}
