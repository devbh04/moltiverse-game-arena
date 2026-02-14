import type { Game, User } from "@chessu/types";
import { Chess } from "chess.js";
import { nanoid } from "nanoid";
import { activeGames } from "../db/models/game.model.js";
import { io } from "../server.js";

// Moltbot - AI agent that plays chess automatically
const MOLTBOT_ID = "moltbot-001";
const MOLTBOT_NAME = "Moltbot";

interface BotInstance {
    gameCode: string;
    side: "white" | "black";
    intervalId?: NodeJS.Timeout;
}

const activeBots: Map<string, BotInstance> = new Map();

export function getMoltbotUser(): User {
    return {
        id: MOLTBOT_ID,
        name: MOLTBOT_NAME,
        connected: true
    };
}

function calculateMove(chess: Chess): { from: string; to: string; promotion?: string } | null {
    const moves = chess.moves({ verbose: true });
    if (moves.length === 0) return null;

    // Simple strategy: prioritize captures, checks, then random
    const captures = moves.filter(m => m.captured);
    const checks = moves.filter(m => m.san.includes('+'));
    
    let selectedMove;
    if (captures.length > 0) {
        // Prioritize capturing higher value pieces
        const pieceValues: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
        captures.sort((a, b) => (pieceValues[b.captured!] || 0) - (pieceValues[a.captured!] || 0));
        selectedMove = captures[0];
    } else if (checks.length > 0) {
        selectedMove = checks[Math.floor(Math.random() * checks.length)];
    } else {
        // Random move with slight preference for center control
        const centerSquares = ['d4', 'd5', 'e4', 'e5', 'c4', 'c5', 'f4', 'f5'];
        const centerMoves = moves.filter(m => centerSquares.includes(m.to));
        if (centerMoves.length > 0 && Math.random() > 0.3) {
            selectedMove = centerMoves[Math.floor(Math.random() * centerMoves.length)];
        } else {
            selectedMove = moves[Math.floor(Math.random() * moves.length)];
        }
    }

    return {
        from: selectedMove.from,
        to: selectedMove.to,
        promotion: selectedMove.promotion
    };
}

async function makeMove(game: Game, botInstance: BotInstance) {
    if (!game.pgn && game.pgn !== "") return;
    if (game.winner || game.endReason) {
        // Game is over, clean up
        stopBot(game.code!);
        return;
    }

    const chess = new Chess();
    if (game.pgn) {
        chess.loadPgn(game.pgn);
    }

    const currentTurn = chess.turn();
    const botTurn = botInstance.side === "white" ? "w" : "b";

    if (currentTurn !== botTurn) {
        return; // Not bot's turn
    }

    const move = calculateMove(chess);
    if (!move) {
        console.log(`[Moltbot] No valid moves available in game ${game.code}`);
        return;
    }

    try {
        const result = chess.move(move);
        if (result) {
            game.pgn = chess.pgn();
            
            // Emit move to all clients in the game room
            io.to(game.code!).emit("receivedMove", move);
            
            console.log(`[Moltbot] Played ${result.san} in game ${game.code}`);

            // Check for game over
            if (chess.isGameOver()) {
                let reason: Game["endReason"];
                if (chess.isCheckmate()) reason = "checkmate";
                else if (chess.isStalemate()) reason = "stalemate";
                else if (chess.isThreefoldRepetition()) reason = "repetition";
                else if (chess.isInsufficientMaterial()) reason = "insufficient";
                else if (chess.isDraw()) reason = "draw";

                const prevTurn = currentTurn;
                const winnerSide = reason === "checkmate" 
                    ? (prevTurn === "w" ? "white" : "black") 
                    : undefined;
                const winnerName = reason === "checkmate"
                    ? winnerSide === "white" ? game.white?.name : game.black?.name
                    : undefined;

                game.winner = reason === "checkmate" ? winnerSide : "draw";
                game.endReason = reason;

                // Import GameModel dynamically to avoid circular deps
                const { default: GameModel } = await import("../db/models/game.model.js");
                const { id } = await GameModel.save(game) as Game;
                game.id = id;

                io.to(game.code!).emit("gameOver", { reason, winnerName, winnerSide, id });
                
                // Clean up
                if (game.timeout) clearTimeout(game.timeout);
                const idx = activeGames.indexOf(game);
                if (idx >= 0) activeGames.splice(idx, 1);
                stopBot(game.code!);
                
                console.log(`[Moltbot] Game ${game.code} ended: ${reason}`);
            }
        }
    } catch (e) {
        console.log(`[Moltbot] Error making move:`, e);
    }
}

export function joinGameAsBot(gameCode: string): { success: boolean; message: string } {
    const game = activeGames.find(g => g.code === gameCode);
    if (!game) {
        return { success: false, message: "Game not found" };
    }

    if (game.white && game.black) {
        return { success: false, message: "Game is full" };
    }

    if (activeBots.has(gameCode)) {
        return { success: false, message: "Bot already in this game" };
    }

    const botUser = getMoltbotUser();
    let botSide: "white" | "black";

    if (!game.white) {
        game.white = botUser;
        botSide = "white";
    } else {
        game.black = botUser;
        botSide = "black";
    }

    // Set game as started if both players are present
    if (game.white && game.black && !game.startedAt) {
        game.startedAt = Date.now();
    }

    const botInstance: BotInstance = {
        gameCode,
        side: botSide
    };

    // Start monitoring the game for bot's turn
    botInstance.intervalId = setInterval(() => {
        const currentGame = activeGames.find(g => g.code === gameCode);
        if (!currentGame) {
            stopBot(gameCode);
            return;
        }
        makeMove(currentGame, botInstance);
    }, 1500); // Check every 1.5 seconds

    activeBots.set(gameCode, botInstance);

    // Notify all clients
    io.to(gameCode).emit("userJoinedAsPlayer", {
        name: MOLTBOT_NAME,
        side: botSide
    });
    io.to(gameCode).emit("receivedLatestGame", game);

    console.log(`[Moltbot] Joined game ${gameCode} as ${botSide}`);
    return { success: true, message: `Moltbot joined as ${botSide}` };
}

export function stopBot(gameCode: string) {
    const bot = activeBots.get(gameCode);
    if (bot) {
        if (bot.intervalId) {
            clearInterval(bot.intervalId);
        }
        activeBots.delete(gameCode);
        console.log(`[Moltbot] Left game ${gameCode}`);
    }
}

export function getActiveBots(): string[] {
    return Array.from(activeBots.keys());
}

// Create a new game with bot as opponent
export function createGameWithBot(hostUser: User, hostSide?: "white" | "black" | "random"): Game {
    const botUser = getMoltbotUser();
    
    // Determine sides
    let actualHostSide: "white" | "black";
    if (hostSide === "white") {
        actualHostSide = "white";
    } else if (hostSide === "black") {
        actualHostSide = "black";
    } else {
        actualHostSide = Math.random() > 0.5 ? "white" : "black";
    }

    const game: Game = {
        code: nanoid(6),
        host: hostUser,
        pgn: "",
        white: actualHostSide === "white" ? hostUser : botUser,
        black: actualHostSide === "black" ? hostUser : botUser,
        startedAt: Date.now()
    };

    activeGames.push(game);

    // Start bot
    const botSide = actualHostSide === "white" ? "black" : "white";
    const botInstance: BotInstance = {
        gameCode: game.code!,
        side: botSide
    };

    botInstance.intervalId = setInterval(() => {
        const currentGame = activeGames.find(g => g.code === game.code);
        if (!currentGame) {
            stopBot(game.code!);
            return;
        }
        makeMove(currentGame, botInstance);
    }, 1500);

    activeBots.set(game.code!, botInstance);
    
    console.log(`[Moltbot] Created game ${game.code} - Bot plays ${botSide}`);
    return game;
}
