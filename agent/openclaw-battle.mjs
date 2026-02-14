#!/usr/bin/env node
/**
 * OpenClaw Agent Battle Launcher
 * 
 * Spawns two OpenClaw agents that play chess against each other.
 * Each agent discovers the arena via skill.md and plays autonomously.
 * 
 * Usage:
 *   node openclaw-battle.mjs
 *   node openclaw-battle.mjs --agent1 main --agent2 challenger
 */

import { spawn, execSync } from "child_process";
import { Chess } from "chess.js";

const AGENT1 = process.argv.includes("--agent1") 
    ? process.argv[process.argv.indexOf("--agent1") + 1] 
    : "main";
const AGENT2 = process.argv.includes("--agent2") 
    ? process.argv[process.argv.indexOf("--agent2") + 1] 
    : "main";

const SERVER = "http://localhost:3001";
const CLI_PATH = "F:\\W3\\monadv\\moltiverse-game-arena\\agent";

// Track game state
let gameCode = null;
let chess = new Chess();
let moveCount = 0;
let gameOver = false;

function log(agent, msg) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] [${agent}] ${msg}`);
}

function runCLI(command) {
    try {
        const result = execSync(`node chess-cli.mjs ${command}`, {
            cwd: CLI_PATH,
            encoding: "utf-8",
            timeout: 30000
        });
        return JSON.parse(result.trim());
    } catch (error) {
        console.error(`CLI Error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

async function runAgent(agentId, message) {
    return new Promise((resolve, reject) => {
        const proc = spawn("openclaw", [
            "agent", 
            "--agent", agentId,
            "--message", message,
            "--local"
        ], {
            shell: true,
            env: {
                ...process.env,
                PNPM_HOME: "C:\\Users\\skpav\\AppData\\Local\\pnpm",
                PATH: `C:\\Users\\skpav\\AppData\\Local\\pnpm;${process.env.PATH}`
            }
        });

        let output = "";
        proc.stdout.on("data", (data) => {
            output += data.toString();
        });
        proc.stderr.on("data", (data) => {
            output += data.toString();
        });
        proc.on("close", (code) => {
            resolve(output);
        });
        proc.on("error", reject);
    });
}

async function authenticateAgent(agentId, name) {
    log(agentId, `Authenticating as ${name}...`);
    const result = runCLI(`auth ${name}`);
    if (result.success) {
        log(agentId, `✅ Authenticated as ${result.name}`);
    } else {
        log(agentId, `❌ Auth failed: ${result.error}`);
    }
    return result;
}

async function createGame(agentId, side = "white") {
    log(agentId, `Creating game as ${side}...`);
    const result = runCLI(`create ${side}`);
    if (result.success) {
        gameCode = result.code;
        log(agentId, `✅ Game created: ${gameCode}`);
        log(agentId, `🔗 Watch at: http://localhost:3000/${gameCode}`);
    } else {
        log(agentId, `❌ Create failed: ${result.error}`);
    }
    return result;
}

async function joinGame(agentId, code) {
    log(agentId, `Joining game ${code}...`);
    const result = runCLI(`join ${code}`);
    if (result.success) {
        log(agentId, `✅ Joined as ${result.side}`);
    } else {
        log(agentId, `❌ Join failed: ${result.error}`);
    }
    return result;
}

async function getGameState() {
    const result = runCLI(`state ${gameCode}`);
    if (result.success && result.pgn) {
        try {
            chess = new Chess();
            chess.loadPgn(result.pgn);
        } catch (e) {}
    }
    return result;
}

async function getLegalMoves() {
    const result = runCLI(`moves ${gameCode}`);
    return result;
}

async function makeMove(agentId, move) {
    log(agentId, `Playing: ${move}`);
    const result = runCLI(`move ${gameCode} ${move}`);
    if (result.success) {
        moveCount++;
        log(agentId, `✅ Move ${moveCount}: ${move}`);
    } else {
        log(agentId, `❌ Move failed: ${result.error}`);
    }
    return result;
}

async function agentSelectMove(agentId) {
    // Ask OpenClaw agent to select a move
    const state = await getGameState();
    const movesResult = await getLegalMoves();
    
    // Moves are in allMovesSAN array
    const moves = movesResult.allMovesSAN || [];
    
    if (!movesResult.success || moves.length === 0) {
        return null;
    }
    
    const moveList = moves.join(", ");
    const fen = chess.fen();
    const history = chess.history().slice(-6).join(" ");
    
    const prompt = `You are playing chess. Current position FEN: ${fen}. Recent moves: ${history || "game start"}. Legal moves: ${moveList}. 
Pick ONE move from the legal moves list. Reply with ONLY the move in algebraic notation (e.g., "e4" or "Nf3"). Nothing else.`;

    log(agentId, "🧠 Thinking...");
    
    const response = await runAgent(agentId, prompt);
    
    // Extract move from response (look for algebraic notation)
    const moveMatch = response.match(/\b([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|O-O(?:-O)?)\b/i);
    
    if (moveMatch) {
        const chosenMove = moveMatch[1];
        // Verify it's legal
        const legal = moves.find(m => 
            m.toLowerCase() === chosenMove.toLowerCase() ||
            m.replace(/[+#]/g, '').toLowerCase() === chosenMove.toLowerCase()
        );
        if (legal) {
            return legal;
        }
    }
    
    // Fallback: pick random legal move
    log(agentId, "⚠️ Could not parse move, picking random");
    return moves[Math.floor(Math.random() * moves.length)];
}

async function playGame() {
    console.log("=".repeat(50));
    console.log("🎮 OpenClaw Agent Battle");
    console.log(`   Agent 1: ${AGENT1} (White)`);
    console.log(`   Agent 2: ${AGENT2} (Black)`);
    console.log("=".repeat(50));
    console.log("");

    // Step 1: Authenticate both agents
    await authenticateAgent(AGENT1, "Moltbot");
    await authenticateAgent(AGENT2, "Challenger");

    // Step 2: Agent1 creates game as White
    const createResult = await createGame(AGENT1, "white");
    if (!createResult.success) {
        console.error("Failed to create game");
        return;
    }

    // Step 3: Agent2 joins as Black
    const joinResult = await joinGame(AGENT2, gameCode);
    if (!joinResult.success) {
        console.error("Failed to join game");
        return;
    }

    console.log("");
    console.log(`🔗 WATCH LIVE: http://localhost:3000/${gameCode}`);
    console.log("");

    // Step 4: Game loop
    let currentAgent = AGENT1; // White moves first
    
    while (!gameOver && moveCount < 200) {
        // Get state
        const state = await getGameState();
        
        // Check game over
        if (state.winner || state.endReason || chess.isGameOver()) {
            gameOver = true;
            console.log("");
            console.log("=".repeat(50));
            console.log("🏁 GAME OVER");
            if (state.winner) {
                console.log(`   Winner: ${state.winner}`);
            } else if (chess.isCheckmate()) {
                console.log(`   Checkmate! ${currentAgent === AGENT1 ? AGENT2 : AGENT1} wins`);
            } else if (chess.isDraw()) {
                console.log("   Draw!");
            }
            console.log(`   Total moves: ${moveCount}`);
            console.log("=".repeat(50));
            break;
        }

        // Check whose turn
        const turn = chess.turn() === "w" ? "white" : "black";
        currentAgent = turn === "white" ? AGENT1 : AGENT2;

        // Agent selects and makes move
        const move = await agentSelectMove(currentAgent);
        if (move) {
            await makeMove(currentAgent, move);
        } else {
            log(currentAgent, "No legal moves available");
            break;
        }

        // Small delay between moves
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log("");
    console.log(`Final PGN: ${chess.pgn()}`);
}

playGame().catch(console.error);
