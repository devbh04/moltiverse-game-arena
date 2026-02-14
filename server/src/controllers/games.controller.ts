import type { Game, User } from "@chessu/types";
import type { Request, Response } from "express";
import { nanoid } from "nanoid";
import { Chess } from "chess.js";

import GameModel, { activeGames } from "../db/models/game.model.js";
import { joinGameAsBot, createGameWithBot, getActiveBots } from "../bot/moltbot.service.js";
import { createBotBattle, stopBattle, getActiveBattles, getBotProfiles, isBotBattle } from "../bot/bot-battle.service.js";
import { io } from "../server.js";

export const getGames = async (req: Request, res: Response) => {
    try {
        if (!req.query.id && !req.query.userid) {
            // get all active games
            res.status(200).json(activeGames.filter((g) => !g.winner));
            return;
        }

        let id, userid;
        if (req.query.id) {
            id = parseInt(req.query.id as string);
        }
        if (req.query.userid) {
            userid = parseInt(req.query.userid as string);
        }

        if (id && !isNaN(id)) {
            // get finished game by id
            const game = await GameModel.findById(id);
            if (!game) {
                res.status(404).end();
            } else {
                res.status(200).json(game);
            }
        } else if (userid && !isNaN(userid)) {
            // get finished games by user id
            const games = await GameModel.findByUserId(userid);
            if (!games) {
                res.status(404).end();
            } else {
                res.status(200).json(games);
            }
        } else {
            res.status(400).end();
        }
    } catch (err: unknown) {
        console.log(err);
        res.status(500).end();
    }
};

export const getActiveGame = async (req: Request, res: Response) => {
    try {
        if (!req.params || !req.params.code) {
            res.status(400).end();
            return;
        }

        const game = activeGames.find((g) => g.code === req.params.code);

        if (!game) {
            res.status(404).end();
        } else {
            res.status(200).json(game);
        }
    } catch (err: unknown) {
        console.log(err);
        res.status(500).end();
    }
};

export const createGame = async (req: Request, res: Response) => {
    try {
        if (!req.session.user?.id) {
            console.log("unauthorized createGame");
            res.status(401).end();
            return;
        }
        const user: User = {
            id: req.session.user.id,
            name: req.session.user.name,
            connected: false
        };
        const game: Game = {
            code: nanoid(6),
            host: user,
            pgn: ""
        };
        if (req.body.side === "white") {
            game.white = user;
        } else if (req.body.side === "black") {
            game.black = user;
        } else {
            // random
            if (Math.floor(Math.random() * 2) === 0) {
                game.white = user;
            } else {
                game.black = user;
            }
        }
        activeGames.push(game);

        res.status(201).json({ code: game.code });
    } catch (err: unknown) {
        console.log(err);
        res.status(500).end();
    }
};

// Create a game with Moltbot as opponent
export const createGameWithBotOpponent = async (req: Request, res: Response) => {
    try {
        if (!req.session.user?.id) {
            console.log("unauthorized createGameWithBot");
            res.status(401).end();
            return;
        }

        const user: User = {
            id: req.session.user.id,
            name: req.session.user.name,
            connected: true
        };

        const side = req.body.side as "white" | "black" | "random" | undefined;
        const game = createGameWithBot(user, side);

        res.status(201).json({ code: game.code, vsBot: true });
    } catch (err: unknown) {
        console.log(err);
        res.status(500).end();
    }
};

// Request Moltbot to join an existing game
export const requestBotJoin = async (req: Request, res: Response) => {
    try {
        if (!req.params || !req.params.code) {
            res.status(400).json({ error: "Game code required" });
            return;
        }

        const gameCode = req.params.code as string;
        const result = joinGameAsBot(gameCode);
        
        if (result.success) {
            res.status(200).json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (err: unknown) {
        console.log(err);
        res.status(500).end();
    }
};

// Get list of active bot games
export const getBotStatus = async (req: Request, res: Response) => {
    try {
        const activeBotGames = getActiveBots();
        res.status(200).json({ activeBots: activeBotGames });
    } catch (err: unknown) {
        console.log(err);
        res.status(500).end();
    }
};

// Make a move via REST API (for CLI/agents)
export const makeMove = async (req: Request, res: Response) => {
    try {
        if (!req.session.user?.id) {
            res.status(401).json({ error: "Not authenticated" });
            return;
        }

        const { code } = req.params;
        const { from, to, promotion } = req.body;

        if (!code || !from || !to) {
            res.status(400).json({ error: "Missing required fields: code, from, to" });
            return;
        }

        const game = activeGames.find((g) => g.code === code);
        if (!game) {
            res.status(404).json({ error: "Game not found" });
            return;
        }

        if (game.winner || game.endReason) {
            res.status(400).json({ error: "Game is already over" });
            return;
        }

        const chess = new Chess();
        if (game.pgn) {
            chess.loadPgn(game.pgn);
        }

        const currentTurn = chess.turn();
        const userId = req.session.user.id;

        // Verify it's the player's turn
        if (currentTurn === "w" && game.white?.id !== userId) {
            res.status(403).json({ error: "Not your turn (white to move)" });
            return;
        }
        if (currentTurn === "b" && game.black?.id !== userId) {
            res.status(403).json({ error: "Not your turn (black to move)" });
            return;
        }

        // Try to make the move
        const moveObj = { from, to, promotion };
        const result = chess.move(moveObj);

        if (!result) {
            res.status(400).json({ error: "Invalid move" });
            return;
        }

        // Update game state
        game.pgn = chess.pgn();

        // Broadcast move to WebSocket clients
        io.to(code).emit("receivedMove", moveObj);

        // Check for game over
        let gameOver = null;
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
            const { id } = await GameModel.save(game) as Game;
            game.id = id;

            io.to(code).emit("gameOver", { reason, winnerName, winnerSide, id });

            // Clean up
            if (game.timeout) clearTimeout(game.timeout);
            const idx = activeGames.indexOf(game);
            if (idx >= 0) activeGames.splice(idx, 1);

            gameOver = { reason, winnerName, winnerSide, id };
        }

        res.status(200).json({
            success: true,
            move: result.san,
            from: result.from,
            to: result.to,
            fen: chess.fen(),
            gameOver
        });
    } catch (err: unknown) {
        console.log(err);
        res.status(500).json({ error: "Server error" });
    }
};

// Join a game as a player via REST API
export const joinGameAsPlayer = async (req: Request, res: Response) => {
    try {
        if (!req.session.user?.id) {
            res.status(401).json({ error: "Not authenticated" });
            return;
        }

        const { code } = req.params;
        const game = activeGames.find((g) => g.code === code);

        if (!game) {
            res.status(404).json({ error: "Game not found" });
            return;
        }

        const user: User = {
            id: req.session.user.id,
            name: req.session.user.name,
            connected: true
        };

        let joinedAs: string | null = null;

        if (!game.white) {
            game.white = user;
            joinedAs = "white";
        } else if (!game.black) {
            game.black = user;
            joinedAs = "black";
        } else {
            res.status(400).json({ error: "Game is full" });
            return;
        }

        // Set game as started
        if (game.white && game.black && !game.startedAt) {
            game.startedAt = Date.now();
        }

        // Broadcast to WebSocket clients
        io.to(code).emit("userJoinedAsPlayer", {
            name: user.name,
            side: joinedAs
        });
        io.to(code).emit("receivedLatestGame", game);

        res.status(200).json({
            success: true,
            joinedAs,
            game: {
                code: game.code,
                white: game.white?.name,
                black: game.black?.name
            }
        });
    } catch (err: unknown) {
        console.log(err);
        res.status(500).json({ error: "Server error" });
    }
};

// ============== BOT BATTLE ENDPOINTS ==============

// Create a bot vs bot battle to spectate
export const createBotBattleGame = async (req: Request, res: Response) => {
    try {
        const { whiteBot, blackBot, moveDelay } = req.body;
        
        const game = createBotBattle({
            whiteBot,
            blackBot,
            moveDelay: moveDelay ? parseInt(moveDelay) : 2000
        });

        res.status(201).json({
            success: true,
            code: game.code,
            white: game.white?.name,
            black: game.black?.name,
            spectateUrl: `http://localhost:3000/${game.code}`,
            message: "Bot battle started! Watch at the URL above."
        });
    } catch (err: unknown) {
        console.log(err);
        res.status(500).json({ error: "Failed to create bot battle" });
    }
};

// Stop an ongoing bot battle
export const stopBotBattle = async (req: Request, res: Response) => {
    try {
        const code = req.params.code as string;
        
        if (!code) {
            res.status(400).json({ error: "Game code required" });
            return;
        }
        
        stopBattle(code);
        res.status(200).json({ success: true, message: `Battle ${code} stopped` });
    } catch (err: unknown) {
        console.log(err);
        res.status(500).json({ error: "Failed to stop bot battle" });
    }
};

// Get list of active bot battles
export const getBotBattles = async (req: Request, res: Response) => {
    try {
        const battles = getActiveBattles();
        res.status(200).json({ battles });
    } catch (err: unknown) {
        console.log(err);
        res.status(500).json({ error: "Failed to get bot battles" });
    }
};

// Get available bot profiles
export const getBotProfilesList = async (req: Request, res: Response) => {
    try {
        const profiles = getBotProfiles();
        res.status(200).json({ profiles });
    } catch (err: unknown) {
        console.log(err);
        res.status(500).json({ error: "Failed to get bot profiles" });
    }
};

// Check if a game is a bot battle (for spectator mode)
export const checkBotBattle = async (req: Request, res: Response) => {
    try {
        const code = req.params.code as string;
        const isBattle = isBotBattle(code);
        res.status(200).json({ isBotBattle: isBattle });
    } catch (err: unknown) {
        console.log(err);
        res.status(500).json({ error: "Failed to check bot battle" });
    }
};
