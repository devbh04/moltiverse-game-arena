/**
 * LLM Agent vs Agent Battle Launcher
 * 
 * Spawns two Google Gemini agents that compete against each other.
 * Each agent reads the skill file, authenticates, joins matchmaking,
 * and plays until game completion.
 * 
 * Usage:
 *   GOOGLE_API_KEY=<your-key> node llm-battle.mjs
 *   GOOGLE_API_KEY=<your-key> node llm-battle.mjs --model gemini-2.0-flash
 * 
 * Watch the battle at: http://localhost:3000/{game_code}
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { Chess } from "chess.js";
import { io } from "socket.io-client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Config
const SERVER = process.env.SERVER_URL || "http://localhost:3001";
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";
const MODEL = process.env.GEMINI_MODEL || process.argv.includes("--model") 
    ? process.argv[process.argv.indexOf("--model") + 1] 
    : "gemini-2.0-flash-lite";
const API_KEY = process.env.GOOGLE_API_KEY;

if (!API_KEY) {
    console.error("❌ GOOGLE_API_KEY environment variable required");
    console.error("   Usage: GOOGLE_API_KEY=<key> node llm-battle.mjs");
    process.exit(1);
}

// Initialize Gemini
const genAI = new GoogleGenerativeAI(API_KEY);

// Agent personalities for variety
const AGENT_PROFILES = [
    {
        name: "Apollo",
        style: "You are Apollo, a confident and aggressive chess player. You prefer attacking play, sacrifices for initiative, and putting constant pressure on your opponent. Look for tactical shots and forcing moves.",
    },
    {
        name: "Athena", 
        style: "You are Athena, a wise and positional chess player. You prefer solid development, controlling the center, and building advantages slowly. Prioritize piece activity and pawn structure.",
    },
];

/**
 * LLM Chess Agent
 */
class LLMAgent {
    constructor(profile, agentId) {
        this.profile = profile;
        this.agentId = agentId;
        this.chess = new Chess();
        this.socket = null;
        this.gameCode = null;
        this.mySide = null;
        this.cookies = null;
        this.isMyTurn = false;
        this.isThinking = false;
        this.gameOver = false;
        this.moveHistory = [];
        
        this.model = genAI.getGenerativeModel({ 
            model: MODEL,
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 256,
            }
        });
    }

    log(msg) {
        console.log(`[${this.profile.name}] ${msg}`);
    }

    async authenticate() {
        this.log("🔐 Authenticating...");
        
        const res = await fetch(`${SERVER}/v1/auth/guest`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: `${this.profile.name}LLM` })
        });

        if (!res.ok) throw new Error(`Auth failed: ${res.status}`);

        this.cookies = res.headers.get("set-cookie");
        const user = await res.json();
        this.log(`✅ Authenticated as: ${user.name}`);
        return user;
    }

    async joinMatchmakingQueue() {
        this.log("🎯 Joining matchmaking queue...");
        
        const res = await fetch(`${SERVER}/v1/games/queue`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Cookie": this.cookies
            }
        });

        if (!res.ok) throw new Error(`Queue join failed: ${res.status}`);

        const result = await res.json();
        
        if (result.status === "matched") {
            this.gameCode = result.code;
            this.mySide = result.side;
            this.log(`⚔️ Matched! Game: ${this.gameCode}, playing as ${this.mySide}`);
            return { matched: true, code: result.code, color: result.side };
        }
        
        this.log(`⏳ Waiting in queue (position ${result.queuePosition})...`);
        return { matched: false, position: result.queuePosition };
    }

    async pollQueueStatus() {
        // Re-POST to queue endpoint to check for match (server handles re-entry)
        const res = await fetch(`${SERVER}/v1/games/queue`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Cookie": this.cookies 
            }
        });

        if (!res.ok) throw new Error(`Queue status failed: ${res.status}`);
        return await res.json();
    }

    async waitForMatch(maxWaitMs = 30000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitMs) {
            const status = await this.pollQueueStatus();
            
            if (status.status === "matched") {
                this.gameCode = status.code;
                this.mySide = status.side;
                this.log(`⚔️ Matched! Game: ${this.gameCode}, playing as ${this.mySide}`);
                return true;
            }
            
            this.log(`⏳ Still waiting (position ${status.queuePosition})...`);
            await new Promise(r => setTimeout(r, 1000));
        }
        
        throw new Error("Queue timeout");
    }

    connectSocket() {
        return new Promise((resolve, reject) => {
            this.log("🔌 Connecting WebSocket...");
            
            this.socket = io(SERVER, {
                extraHeaders: { Cookie: this.cookies },
                transports: ["websocket", "polling"]
            });

            this.socket.on("connect", () => {
                this.log("✅ WebSocket connected");
                resolve();
            });

            this.socket.on("connect_error", reject);
            
            // Game state updates
            this.socket.on("receivedLatestGame", (game) => this.onGameState(game));
            this.socket.on("receivedMove", (move) => this.onOpponentMove(move));
            this.socket.on("gameOver", (result) => this.onGameOver(result));
        });
    }

    joinGameRoom() {
        this.log(`📍 Joining game room: ${this.gameCode}`);
        this.socket.emit("joinLobby", this.gameCode);
    }

    onGameState(game) {
        this.log(`📊 Received game state: white=${game.white?.name}, black=${game.black?.name}, pgn="${game.pgn || ''}"`);
        
        if (game.pgn) {
            this.chess.loadPgn(game.pgn);
        } else {
            this.chess = new Chess(); // Reset to initial position
        }
        
        // Determine sides - check if our name is in the player's name
        const myName = `${this.profile.name}LLM`;
        if (game.white?.name === myName) {
            this.mySide = "white";
        } else if (game.black?.name === myName) {
            this.mySide = "black";
        }
        
        this.log(`🎮 I am playing as: ${this.mySide}`);
        this.checkTurn();
    }

    onOpponentMove(move) {
        this.log(`📥 Opponent played: ${move.san || move.from + move.to}`);
        
        // Apply move to local board
        try {
            if (move.san) {
                this.chess.move(move.san);
            } else {
                this.chess.move({ from: move.from, to: move.to, promotion: move.promotion });
            }
        } catch (e) {
            // Fetch fresh state
        }
        
        this.checkTurn();
    }

    onGameOver(result) {
        this.log(`🏁 Game Over: ${JSON.stringify(result)}`);
        this.gameOver = true;
    }

    checkTurn() {
        if (this.gameOver) return;
        if (!this.mySide) {
            this.log("⚠️ Side not determined yet");
            return;
        }
        
        const turn = this.chess.turn() === "w" ? "white" : "black";
        const wasMyTurn = this.isMyTurn;
        this.isMyTurn = (turn === this.mySide);
        
        this.log(`🔄 Turn check: chess turn=${turn}, my side=${this.mySide}, isMyTurn=${this.isMyTurn}`);
        
        if (this.isMyTurn && !wasMyTurn) {
            this.log(`🎯 My turn! Making move...`);
            // Small delay to ensure state is synced
            setTimeout(() => this.makeAIMove(), 500);
        }
    }

    async makeAIMove() {
        if (this.gameOver || !this.isMyTurn) return;
        if (this.isThinking) {
            this.log("⏳ Already thinking...");
            return;
        }
        
        this.isThinking = true;
        
        try {
            const legalMoves = this.chess.moves({ verbose: true });
            
            if (legalMoves.length === 0) {
                this.log("No legal moves available");
                return;
            }

            // Ask LLM for a move
            const move = await this.selectMoveWithLLM(legalMoves);
            
            if (move) {
                this.sendMove(move);
            }
        } finally {
            this.isThinking = false;
        }
    }

    async selectMoveWithLLM(legalMoves) {
        const moveNotations = legalMoves.map(m => m.san).join(", ");
        const fen = this.chess.fen();
        const history = this.chess.history().slice(-10).join(" ");
        
        const prompt = `${this.profile.style}

You are playing chess as ${this.mySide}.

Current position (FEN): ${fen}

Recent moves: ${history || "(game just started)"}

Legal moves available: ${moveNotations}

Analyze briefly and select ONE move. Your response format:
ANALYSIS: [1-2 sentences about the position]
MOVE: [exact move notation from the legal moves list]

Important: The MOVE must exactly match one of the legal moves listed.`;

        try {
            const result = await this.model.generateContent(prompt);
            const response = result.response.text();
            
            // Extract move from response
            const moveMatch = response.match(/MOVE:\s*([KQRBNP]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|O-O(?:-O)?)/i);
            
            if (moveMatch) {
                const chosenMove = moveMatch[1];
                
                // Verify it's legal
                const legalMove = legalMoves.find(m => 
                    m.san.toLowerCase() === chosenMove.toLowerCase() ||
                    m.san.replace(/[+#]/g, '').toLowerCase() === chosenMove.toLowerCase()
                );
                
                if (legalMove) {
                    this.log(`🧠 LLM chose: ${legalMove.san}`);
                    const analysisMatch = response.match(/ANALYSIS:\s*(.+?)(?=MOVE:|$)/is);
                    if (analysisMatch) {
                        this.log(`   💭 ${analysisMatch[1].trim().substring(0, 100)}`);
                    }
                    return legalMove;
                }
            }
            
            // Fallback: random move if LLM response invalid
            this.log(`⚠️ LLM gave invalid move, picking random`);
            return legalMoves[Math.floor(Math.random() * legalMoves.length)];
            
        } catch (error) {
            this.log(`⚠️ LLM error: ${error.message}, picking random move`);
            return legalMoves[Math.floor(Math.random() * legalMoves.length)];
        }
    }

    sendMove(move) {
        this.log(`📤 Playing: ${move.san}`);
        
        // Server expects just the move object, not wrapped
        this.socket.emit("sendMove", { 
            from: move.from, 
            to: move.to, 
            promotion: move.promotion 
        });
        
        // Apply locally
        try {
            this.chess.move(move);
        } catch (e) {}
        
        this.isMyTurn = false;
        this.moveHistory.push(move.san);
    }

    async run() {
        // Step 1: Authenticate
        await this.authenticate();
        
        // Step 2: Join matchmaking queue
        const queueResult = await this.joinMatchmakingQueue();
        
        // Step 3: Wait for match if not immediately matched
        if (!queueResult.matched) {
            await this.waitForMatch();
        }
        
        // Step 4: Connect socket and join game
        await this.connectSocket();
        this.joinGameRoom();
        
        // Step 5: Wait for game to end
        return new Promise((resolve) => {
            const checkEnd = setInterval(() => {
                if (this.gameOver || this.chess.isGameOver()) {
                    clearInterval(checkEnd);
                    this.log(`🏁 Final position after ${this.chess.history().length} moves`);
                    resolve({
                        gameCode: this.gameCode,
                        side: this.mySide,
                        moves: this.chess.history().length,
                        result: this.chess.isCheckmate() ? "checkmate" : 
                                this.chess.isDraw() ? "draw" : "unknown"
                    });
                }
            }, 1000);
            
            // Timeout after 10 minutes
            setTimeout(() => {
                clearInterval(checkEnd);
                this.log("⏰ Battle timeout");
                resolve({ gameCode: this.gameCode, result: "timeout" });
            }, 600000);
        });
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}

/**
 * Main: Launch two LLM agents to battle
 */
async function main() {
    console.log("🎮 LLM Agent Battle Launcher");
    console.log(`   Model: ${MODEL}`);
    console.log(`   Server: ${SERVER}`);
    console.log("");

    // Create two agents
    const agent1 = new LLMAgent(AGENT_PROFILES[0], 1);
    const agent2 = new LLMAgent(AGENT_PROFILES[1], 2);

    try {
        // Launch agents with slight stagger to avoid race conditions
        console.log("🚀 Launching agents...\n");
        
        // Start agent1 first
        const agent1Promise = agent1.run();
        
        // Small delay before agent2 joins to ensure agent1 is in queue
        await new Promise(r => setTimeout(r, 500));
        
        const agent2Promise = agent2.run();
        
        const results = await Promise.all([agent1Promise, agent2Promise]);

        console.log("\n" + "=".repeat(50));
        console.log("🏆 BATTLE COMPLETE");
        console.log("=".repeat(50));
        console.log(`   Game Code: ${results[0].gameCode}`);
        console.log(`   Watch replay: ${CLIENT_URL}/${results[0].gameCode}`);
        console.log(`   Total moves: ${Math.max(results[0].moves, results[1].moves)}`);
        console.log(`   Result: ${results[0].result}`);

    } catch (error) {
        console.error("❌ Battle failed:", error.message);
    } finally {
        agent1.disconnect();
        agent2.disconnect();
        process.exit(0);
    }
}

main();
