import type { RPSGame, TTTGame, User } from "@chessu/types";
import type { Request, Response } from "express";
import { nanoid } from "nanoid";

export const activeRPSGames: RPSGame[] = [];
export const activeTTTGames: TTTGame[] = [];

// ── RPS ──────────────────────────────────────────────

export const getRPSGames = async (_req: Request, res: Response) => {
    try {
        res.status(200).json(activeRPSGames.filter((g) => !g.winner));
    } catch (err) {
        console.log(err);
        res.status(500).end();
    }
};

export const getActiveRPSGame = async (req: Request, res: Response) => {
    try {
        const game = activeRPSGames.find((g) => g.code === req.params.code);
        if (!game) {
            res.status(404).end();
        } else {
            res.status(200).json(game);
        }
    } catch (err) {
        console.log(err);
        res.status(500).end();
    }
};

export const createRPSGame = async (req: Request, res: Response) => {
    try {
        if (!req.session.user?.id) {
            res.status(401).end();
            return;
        }
        const user: User = {
            id: req.session.user.id,
            name: req.session.user.name,
            connected: false
        };
        const game: RPSGame = {
            code: nanoid(6),
            host: user,
            player1: user,
            player2: undefined,
            scores: { p1: 0, p2: 0 },
            round: 0,
            roundState: "waiting",
            picks: {},
            roundResults: [],
            winner: null,
            observers: []
        };
        activeRPSGames.push(game);
        res.status(201).json({ code: game.code });
    } catch (err) {
        console.log(err);
        res.status(500).end();
    }
};

// ── TTT ──────────────────────────────────────────────

export const getTTTGames = async (_req: Request, res: Response) => {
    try {
        res.status(200).json(activeTTTGames.filter((g) => !g.winner));
    } catch (err) {
        console.log(err);
        res.status(500).end();
    }
};

export const getActiveTTTGame = async (req: Request, res: Response) => {
    try {
        const game = activeTTTGames.find((g) => g.code === req.params.code);
        if (!game) {
            res.status(404).end();
        } else {
            res.status(200).json(game);
        }
    } catch (err) {
        console.log(err);
        res.status(500).end();
    }
};

export const createTTTGame = async (req: Request, res: Response) => {
    try {
        if (!req.session.user?.id) {
            res.status(401).end();
            return;
        }
        const user: User = {
            id: req.session.user.id,
            name: req.session.user.name,
            connected: false
        };
        const game: TTTGame = {
            code: nanoid(6),
            host: user,
            playerX: user,
            playerO: undefined,
            board: Array(9).fill(null),
            turn: "X",
            winner: null,
            observers: []
        };
        activeTTTGames.push(game);
        res.status(201).json({ code: game.code });
    } catch (err) {
        console.log(err);
        res.status(500).end();
    }
};
