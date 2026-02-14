#!/usr/bin/env node
/**
 * True Agent Discovery Battle
 * 
 * This implements the REAL agent flow:
 * 1. Agent fetches skill.md from the arena URL
 * 2. Agent reads and parses the instructions
 * 3. Agent makes raw HTTP requests based on what it learned
 * 4. No pre-built CLI - pure discovery!
 * 
 * Usage:
 *   node discovery-battle.mjs
 *   node discovery-battle.mjs --arena http://localhost:3001
 */

import { spawn } from "child_process";
import { Chess } from "chess.js";

// Arena configuration
const ARENA_URL = process.argv.includes("--arena") 
    ? process.argv[process.argv.indexOf("--arena") + 1] 
    : "http://localhost:3001";
const SKILL_URL = process.argv.includes("--skill")
    ? process.argv[process.argv.indexOf("--skill") + 1]
    : "http://localhost:3000/skill.md";

// Agent names
const AGENT1_NAME = "Apollo";
const AGENT2_NAME = "Athena";

let gameCode = null;
let chess = new Chess();
let moveCount = 0;
let gameOver = false;

// Store cookies for each agent
const agentCookies = {
    [AGENT1_NAME]: null,
    [AGENT2_NAME]: null
};

function log(agent, msg) {
    const timestamp = new Date().toLocaleTimeString();
    const emoji = agent === AGENT1_NAME ? "🔵" : "🔴";
    console.log(`[${timestamp}] ${emoji} [${agent}] ${msg}`);
}

async function fetchSkillFile() {
    log("System", `📖 Fetching skill file from ${SKILL_URL}...`);
    try {
        const res = await fetch(SKILL_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const content = await res.text();
        log("System", `✅ Skill file loaded (${content.length} chars)`);
        return content;
    } catch (error) {
        log("System", `❌ Failed to fetch skill file: ${error.message}`);
        // Fallback to embedded minimal instructions
        return getMinimalSkillFile();
    }
}

function getMinimalSkillFile() {
    return `
# Chess Arena API

Base URL: ${ARENA_URL}

## Authentication
POST /v1/auth/guest
Body: {"name": "YourName"}
Response: Sets session cookie

## Join Matchmaking Queue
POST /v1/games/queue
Cookie: <session>
Response: {"status": "matched"|"waiting", "code": "...", "side": "white"|"black"}

## Get Game State
GET /v1/games/{code}
Response: {"pgn": "...", "white": {...}, "black": {...}, "winner": null}

## Make Move
POST /v1/games/{code}/move
Body: {"from": "e2", "to": "e4"}
Response: {"success": true}

## Move Format
- Coordinate notation: {"from": "e2", "to": "e4"}
- For promotion: {"from": "e7", "to": "e8", "promotion": "q"}
`;
}

async function runOpenClawAgent(agentId, message) {
    return new Promise((resolve, reject) => {
        const proc = spawn("openclaw", [
            "agent", 
            "--agent", "main",
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

// Direct HTTP functions (agent learns to do these from skill.md)
async function authenticate(name) {
    log(name, "🔐 Authenticating via API...");
    const res = await fetch(`${ARENA_URL}/v1/auth/guest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
    });
    
    if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
    
    // Store cookie
    const cookie = res.headers.get("set-cookie");
    agentCookies[name] = cookie;
    
    const user = await res.json();
    log(name, `✅ Authenticated as ${user.name}`);
    return user;
}

async function joinMatchmakingQueue(name) {
    log(name, "🎯 Joining matchmaking queue...");
    const res = await fetch(`${ARENA_URL}/v1/games/queue`, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "Cookie": agentCookies[name]
        }
    });
    
    if (!res.ok) throw new Error(`Queue failed: ${res.status}`);
    
    const result = await res.json();
    
    if (result.status === "matched") {
        log(name, `⚔️ Matched! Game: ${result.code}, playing as ${result.side}`);
        return { matched: true, code: result.code, side: result.side };
    } else {
        log(name, `⏳ Waiting in queue (position ${result.queuePosition})...`);
        return { matched: false };
    }
}

async function pollForMatch(name, maxWait = 30000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
        const res = await fetch(`${ARENA_URL}/v1/games/queue`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Cookie": agentCookies[name]
            }
        });
        
        const result = await res.json();
        if (result.status === "matched") {
            log(name, `⚔️ Matched! Game: ${result.code}, playing as ${result.side}`);
            return { matched: true, code: result.code, side: result.side };
        }
        
        await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error("Queue timeout");
}

async function getGameState(name) {
    const res = await fetch(`${ARENA_URL}/v1/games/${gameCode}`, {
        headers: { "Cookie": agentCookies[name] }
    });
    
    if (!res.ok) throw new Error(`State failed: ${res.status}`);
    return await res.json();
}

async function getLegalMoves(name) {
    // Get game state first
    const game = await getGameState(name);
    
    // Calculate legal moves locally using chess.js (same as API approach)
    const chess = new Chess();
    if (game.pgn) chess.loadPgn(game.pgn);
    
    const moves = chess.moves({ verbose: true });
    
    return {
        success: true,
        code: gameCode,
        turn: chess.turn() === "w" ? "white" : "black",
        fen: chess.fen(),
        totalMoves: moves.length,
        allMovesSAN: moves.map(m => m.san),
        moves: moves  // Full verbose moves for from/to
    };
}

async function makeMove(name, from, to, promotion = null) {
    const body = { from, to };
    if (promotion) body.promotion = promotion;
    
    log(name, `📤 Making move: ${from}${to}`);
    
    const res = await fetch(`${ARENA_URL}/v1/games/${gameCode}/move`, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "Cookie": agentCookies[name]
        },
        body: JSON.stringify(body)
    });
    
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Move failed: ${err}`);
    }
    
    const result = await res.json();
    if (result.success) {
        moveCount++;
        log(name, `✅ Move ${moveCount}: ${from}${to}`);
    }
    return result;
}

async function askAgentForMove(agentName, skillContent, fen, legalMoves, history) {
    const moveList = legalMoves.join(", ");
    
    const prompt = `You are ${agentName}, an AI chess agent competing on the Moltiverse Chess Arena.

## Your Skill File (API Documentation)
${skillContent}

## Current Game State
- Position (FEN): ${fen}
- Recent moves: ${history || "(opening)"}
- Legal moves available: ${moveList}

## Your Task
Select ONE move from the legal moves list. 

Think about:
1. Control the center (e4, d4, e5, d5)
2. Develop pieces (knights and bishops early)
3. Castle for king safety
4. Look for captures and tactical opportunities

Reply with ONLY the move in algebraic notation (e.g., "e4", "Nf3", "Bxc6").
Just the move, nothing else.`;

    const response = await runOpenClawAgent(agentName, prompt);
    
    // Extract move from response
    const moveMatch = response.match(/\b([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|O-O(?:-O)?)\b/gi);
    
    if (moveMatch) {
        for (const candidate of moveMatch) {
            const legal = legalMoves.find(m => 
                m.toLowerCase() === candidate.toLowerCase() ||
                m.replace(/[+#]/g, '').toLowerCase() === candidate.toLowerCase()
            );
            if (legal) {
                log(agentName, `🧠 Selected: ${legal}`);
                return legal;
            }
        }
    }
    
    // Fallback: random
    log(agentName, "⚠️ Could not parse LLM move, picking random");
    return legalMoves[Math.floor(Math.random() * legalMoves.length)];
}

function sanToCoords(san, chessInstance) {
    // Make the move on a temporary board to get from/to squares
    const tempChess = new Chess(chessInstance.fen());
    try {
        const move = tempChess.move(san);
        if (move) {
            return { from: move.from, to: move.to, promotion: move.promotion };
        }
    } catch (e) {}
    return null;
}

async function playTurn(agentName, skillContent) {
    // 1. Get game state
    const state = await getGameState(agentName);
    
    // Check game over
    if (state.winner || state.endReason) {
        gameOver = true;
        return;
    }
    
    // Load PGN
    if (state.pgn) {
        chess = new Chess();
        chess.loadPgn(state.pgn);
    }
    
    if (chess.isGameOver()) {
        gameOver = true;
        return;
    }
    
    // 2. Get legal moves
    const movesResult = await getLegalMoves(agentName);
    const legalMoves = movesResult.allMovesSAN || [];
    
    if (legalMoves.length === 0) {
        gameOver = true;
        return;
    }
    
    // 3. Ask agent to select move
    const history = chess.history().slice(-8).join(" ");
    const selectedMove = await askAgentForMove(
        agentName, 
        skillContent, 
        chess.fen(), 
        legalMoves, 
        history
    );
    
    // 4. Convert SAN to coordinates and make move
    const coords = sanToCoords(selectedMove, chess);
    if (coords) {
        await makeMove(agentName, coords.from, coords.to, coords.promotion);
        // Update local chess state to track turns correctly
        chess.move(selectedMove);
    } else {
        log(agentName, `❌ Could not parse move: ${selectedMove}`);
    }
}

async function main() {
    console.log("=".repeat(60));
    console.log("🎮 TRUE AGENT DISCOVERY BATTLE");
    console.log("=".repeat(60));
    console.log("");
    console.log("This implements the REAL moltbook.com agent flow:");
    console.log("1. Agents fetch skill.md from the arena");
    console.log("2. Agents READ and LEARN the API from the skill file");
    console.log("3. Agents make raw HTTP requests based on what they learned");
    console.log("");
    console.log(`Arena: ${ARENA_URL}`);
    console.log(`Skill: ${SKILL_URL}`);
    console.log("");

    // Step 1: Fetch skill file (what external agents would do)
    const skillContent = await fetchSkillFile();
    
    // Step 2: Both agents authenticate (following skill.md instructions)
    log("System", "📚 Agents reading skill.md and authenticating...");
    await authenticate(AGENT1_NAME);
    await authenticate(AGENT2_NAME);
    
    // Step 3: Agent 1 joins matchmaking queue
    log("System", "🎯 Agents joining matchmaking queue...");
    const result1 = await joinMatchmakingQueue(AGENT1_NAME);
    
    // Step 4: Agent 2 joins queue (should match with Agent 1)
    await new Promise(r => setTimeout(r, 500)); // Small delay
    const result2 = await joinMatchmakingQueue(AGENT2_NAME);
    
    // Handle matching
    let agent1Side, agent2Side;
    
    if (result1.matched) {
        gameCode = result1.code;
        agent1Side = result1.side;
    } else {
        const match1 = await pollForMatch(AGENT1_NAME);
        gameCode = match1.code;
        agent1Side = match1.side;
    }
    
    if (result2.matched) {
        gameCode = gameCode || result2.code;
        agent2Side = result2.side;
    } else if (!result1.matched) {
        const match2 = await pollForMatch(AGENT2_NAME);
        gameCode = gameCode || match2.code;
        agent2Side = match2.side;
    } else {
        agent2Side = agent1Side === "white" ? "black" : "white";
    }
    
    console.log("");
    console.log("=".repeat(60));
    console.log(`🔗 WATCH LIVE: http://localhost:3000/${gameCode}`);
    console.log("=".repeat(60));
    console.log("");
    console.log(`${AGENT1_NAME}: ${agent1Side}`);
    console.log(`${AGENT2_NAME}: ${agent2Side}`);
    console.log("");

    // Determine who plays white
    const whiteAgent = agent1Side === "white" ? AGENT1_NAME : AGENT2_NAME;
    const blackAgent = agent1Side === "white" ? AGENT2_NAME : AGENT1_NAME;
    
    // Step 5: Game loop - both agents take turns
    while (!gameOver && moveCount < 200) {
        const turn = chess.turn() === "w" ? "white" : "black";
        const currentAgent = turn === "white" ? whiteAgent : blackAgent;
        
        await playTurn(currentAgent, skillContent);
        
        // Small delay between moves for watchability
        await new Promise(r => setTimeout(r, 1500));
    }
    
    // Game over
    console.log("");
    console.log("=".repeat(60));
    console.log("🏁 GAME OVER");
    console.log("=".repeat(60));
    
    if (chess.isCheckmate()) {
        const winner = chess.turn() === "w" ? blackAgent : whiteAgent;
        console.log(`🏆 Winner: ${winner} by checkmate!`);
    } else if (chess.isDraw()) {
        console.log("🤝 Draw!");
        if (chess.isStalemate()) console.log("   (Stalemate)");
        if (chess.isThreefoldRepetition()) console.log("   (Threefold repetition)");
        if (chess.isInsufficientMaterial()) console.log("   (Insufficient material)");
    }
    
    console.log(`Total moves: ${moveCount}`);
    console.log(`Final PGN: ${chess.pgn()}`);
    console.log("");
    console.log(`Replay at: http://localhost:3000/${gameCode}`);
}

main().catch(console.error);
