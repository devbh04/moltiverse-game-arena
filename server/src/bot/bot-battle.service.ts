import type { Game, User } from "@chessu/types";
import { Chess, Move } from "chess.js";
import { nanoid } from "nanoid";
import { activeGames } from "../db/models/game.model.js";
import { io } from "../server.js";

// Bot profiles with different playing styles
const BOT_PROFILES = {
    aggressive: {
        id: "bot-alpha",
        name: "Alpha",
        style: "aggressive" as const
    },
    defensive: {
        id: "bot-bravo", 
        name: "Bravo",
        style: "defensive" as const
    },
    random: {
        id: "bot-charlie",
        name: "Charlie",
        style: "random" as const
    },
    tactical: {
        id: "bot-delta",
        name: "Delta",
        style: "tactical" as const
    },
    positional: {
        id: "bot-gamma",
        name: "Gamma",
        style: "positional" as const
    }
};

type BotStyle = "aggressive" | "defensive" | "random" | "tactical" | "positional";

interface BattleInstance {
    gameCode: string;
    whiteBot: BotStyle;
    blackBot: BotStyle;
    moveDelay: number;
    isRunning: boolean;
    intervalId?: NodeJS.Timeout;
}

const activeBattles: Map<string, BattleInstance> = new Map();

// Piece values for move evaluation
const PIECE_VALUES: Record<string, number> = { 
    p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 
};

// Position tables for piece-square evaluation
const PAWN_TABLE = [
    0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5,  5, 10, 25, 25, 10,  5,  5,
    0,  0,  0, 20, 20,  0,  0,  0,
    5, -5,-10,  0,  0,-10, -5,  5,
    5, 10, 10,-20,-20, 10, 10,  5,
    0,  0,  0,  0,  0,  0,  0,  0
];

const KNIGHT_TABLE = [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50
];

function squareToIndex(square: string, isWhite: boolean): number {
    const file = square.charCodeAt(0) - 97; // a=0, b=1, etc.
    const rank = parseInt(square[1]) - 1;   // 1=0, 2=1, etc.
    const index = isWhite ? (7 - rank) * 8 + file : rank * 8 + file;
    return index;
}

function evaluateMove(move: Move, chess: Chess, style: BotStyle): number {
    let score = Math.random() * 10; // Small randomness
    const isWhite = chess.turn() === 'w';
    
    switch (style) {
        case "aggressive":
            // Prioritize captures and attacks
            if (move.captured) {
                score += PIECE_VALUES[move.captured] * 2;
            }
            if (move.san.includes('+')) score += 150; // Checks
            if (move.san.includes('#')) score += 10000; // Checkmate
            // Prefer moving pieces forward
            const fromRank = parseInt(move.from[1]);
            const toRank = parseInt(move.to[1]);
            if (isWhite && toRank > fromRank) score += 20;
            if (!isWhite && toRank < fromRank) score += 20;
            break;
            
        case "defensive":
            // Prioritize safety and pawn structure
            if (move.piece === 'k' && (move.san === 'O-O' || move.san === 'O-O-O')) {
                score += 200; // Castling
            }
            if (move.piece === 'p') {
                score += 30; // Pawn moves for structure
            }
            // Penalize moving same piece twice in opening
            if (chess.moveNumber() < 10 && move.captured === undefined) {
                score += 50;
            }
            break;
            
        case "tactical":
            // Focus on captures, forks, and tactics
            if (move.captured) {
                // MVV-LVA (Most Valuable Victim - Least Valuable Attacker)
                score += PIECE_VALUES[move.captured] * 10 - PIECE_VALUES[move.piece] * 1;
            }
            if (move.san.includes('+')) score += 100;
            if (move.san.includes('#')) score += 10000;
            // Knight moves to center are often tactical
            if (move.piece === 'n') {
                const idx = squareToIndex(move.to, isWhite);
                score += KNIGHT_TABLE[idx] / 2;
            }
            break;
            
        case "positional":
            // Focus on piece placement and center control
            const centerSquares = ['d4', 'd5', 'e4', 'e5'];
            const innerRing = ['c3', 'c4', 'c5', 'c6', 'd3', 'd6', 'e3', 'e6', 'f3', 'f4', 'f5', 'f6'];
            
            if (centerSquares.includes(move.to)) score += 80;
            else if (innerRing.includes(move.to)) score += 40;
            
            // Piece development bonus
            if (chess.moveNumber() < 12) {
                if ((move.piece === 'n' || move.piece === 'b') && 
                    (move.from[1] === '1' || move.from[1] === '8')) {
                    score += 60; // Developing pieces
                }
            }
            
            // Pawn position scoring
            if (move.piece === 'p') {
                const idx = squareToIndex(move.to, isWhite);
                score += PAWN_TABLE[idx] / 3;
            }
            break;
            
        case "random":
        default:
            score = Math.random() * 100;
            break;
    }
    
    return score;
}

function selectMove(chess: Chess, style: BotStyle): Move | null {
    const moves = chess.moves({ verbose: true });
    if (moves.length === 0) return null;
    
    // Score all moves
    const scoredMoves = moves.map(move => ({
        move,
        score: evaluateMove(move, chess, style)
    }));
    
    // Sort by score descending
    scoredMoves.sort((a, b) => b.score - a.score);
    
    // Pick from top moves with some randomness for variety
    const topCount = Math.min(3, scoredMoves.length);
    const topMoves = scoredMoves.slice(0, topCount);
    
    // Weighted random selection from top moves
    const totalScore = topMoves.reduce((sum, m) => sum + Math.max(m.score, 1), 0);
    let random = Math.random() * totalScore;
    
    for (const { move, score } of topMoves) {
        random -= Math.max(score, 1);
        if (random <= 0) return move;
    }
    
    return topMoves[0].move;
}

async function executeBotTurn(battle: BattleInstance) {
    const game = activeGames.find(g => g.code === battle.gameCode);
    if (!game || !battle.isRunning) {
        stopBattle(battle.gameCode);
        return;
    }
    
    if (game.winner || game.endReason) {
        stopBattle(battle.gameCode);
        return;
    }
    
    const chess = new Chess();
    if (game.pgn) {
        chess.loadPgn(game.pgn);
    }
    
    const currentTurn = chess.turn();
    const currentStyle = currentTurn === 'w' ? battle.whiteBot : battle.blackBot;
    const currentBotName = currentTurn === 'w' ? game.white?.name : game.black?.name;
    
    const move = selectMove(chess, currentStyle);
    if (!move) {
        console.log(`[BotBattle] No valid moves for ${currentBotName} in game ${battle.gameCode}`);
        return;
    }
    
    try {
        const result = chess.move(move);
        if (result) {
            game.pgn = chess.pgn();
            
            // Emit move to spectators
            io.to(battle.gameCode).emit("receivedMove", {
                from: move.from,
                to: move.to,
                promotion: move.promotion
            });
            
            console.log(`[BotBattle] ${currentBotName} played ${result.san} in game ${battle.gameCode}`);
            
            // Check for game over
            if (chess.isGameOver()) {
                let reason: Game["endReason"];
                if (chess.isCheckmate()) reason = "checkmate";
                else if (chess.isStalemate()) reason = "stalemate";
                else if (chess.isThreefoldRepetition()) reason = "repetition";
                else if (chess.isInsufficientMaterial()) reason = "insufficient";
                else if (chess.isDraw()) reason = "draw";
                
                const winnerSide = reason === "checkmate" 
                    ? (currentTurn === "w" ? "white" : "black")
                    : undefined;
                const winnerName = reason === "checkmate"
                    ? winnerSide === "white" ? game.white?.name : game.black?.name
                    : undefined;
                
                game.winner = reason === "checkmate" ? winnerSide : "draw";
                game.endReason = reason;
                
                // Save to database
                const { default: GameModel } = await import("../db/models/game.model.js");
                const { id } = await GameModel.save(game) as Game;
                game.id = id;
                
                io.to(battle.gameCode).emit("gameOver", { reason, winnerName, winnerSide, id });
                io.to(battle.gameCode).emit("botBattleEnded", { 
                    winner: winnerName,
                    reason,
                    totalMoves: chess.moveNumber()
                });
                
                // Cleanup
                if (game.timeout) clearTimeout(game.timeout);
                const idx = activeGames.indexOf(game);
                if (idx >= 0) activeGames.splice(idx, 1);
                stopBattle(battle.gameCode);
                
                console.log(`[BotBattle] Game ${battle.gameCode} ended: ${reason} - Winner: ${winnerName || 'Draw'}`);
            }
        }
    } catch (e) {
        console.log(`[BotBattle] Error making move:`, e);
    }
}

export interface BotBattleOptions {
    whiteBot?: BotStyle;
    blackBot?: BotStyle;
    moveDelay?: number; // milliseconds between moves
}

export function createBotBattle(options: BotBattleOptions = {}): Game {
    const whiteStyle = options.whiteBot || getRandomBotStyle();
    const blackStyle = options.blackBot || getRandomBotStyle(whiteStyle);
    const moveDelay = options.moveDelay || 2000; // Default 2 seconds
    
    const whiteBot = BOT_PROFILES[whiteStyle];
    const blackBot = BOT_PROFILES[blackStyle];
    
    const whiteUser: User = {
        id: whiteBot.id,
        name: whiteBot.name,
        connected: true
    };
    
    const blackUser: User = {
        id: blackBot.id,
        name: blackBot.name,
        connected: true
    };
    
    const game: Game = {
        code: nanoid(6),
        host: whiteUser,
        pgn: "",
        white: whiteUser,
        black: blackUser,
        startedAt: Date.now()
    };
    
    activeGames.push(game);
    
    const battle: BattleInstance = {
        gameCode: game.code!,
        whiteBot: whiteStyle,
        blackBot: blackStyle,
        moveDelay,
        isRunning: true
    };
    
    // Start battle loop with delay
    battle.intervalId = setInterval(() => {
        executeBotTurn(battle);
    }, moveDelay);
    
    activeBattles.set(game.code!, battle);
    
    console.log(`[BotBattle] Started: ${whiteBot.name} (White) vs ${blackBot.name} (Black) - Game ${game.code}`);
    return game;
}

function getRandomBotStyle(exclude?: BotStyle): BotStyle {
    const styles: BotStyle[] = ["aggressive", "defensive", "random", "tactical", "positional"];
    const available = exclude ? styles.filter(s => s !== exclude) : styles;
    return available[Math.floor(Math.random() * available.length)];
}

export function stopBattle(gameCode: string) {
    const battle = activeBattles.get(gameCode);
    if (battle) {
        battle.isRunning = false;
        if (battle.intervalId) {
            clearInterval(battle.intervalId);
        }
        activeBattles.delete(gameCode);
        console.log(`[BotBattle] Stopped game ${gameCode}`);
    }
}

export function getActiveBattles(): Array<{
    code: string;
    whiteBot: string;
    blackBot: string;
    moveDelay: number;
}> {
    return Array.from(activeBattles.entries()).map(([code, battle]) => ({
        code,
        whiteBot: BOT_PROFILES[battle.whiteBot].name,
        blackBot: BOT_PROFILES[battle.blackBot].name,
        moveDelay: battle.moveDelay
    }));
}

export function getBotProfiles() {
    return Object.entries(BOT_PROFILES).map(([key, profile]) => ({
        id: key,
        name: profile.name,
        style: profile.style
    }));
}

export function isBotBattle(gameCode: string): boolean {
    return activeBattles.has(gameCode);
}
