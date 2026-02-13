import type { Socket } from "socket.io";
import type { TTTGame } from "@chessu/types";
import { io } from "../server.js";
import { activeTTTGames } from "../controllers/minigames.controller.js";

const turnTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

const WINNING_COMBOS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
    [0, 4, 8], [2, 4, 6]              // diagonals
];

function checkWinner(board: (string | null)[]): "X" | "O" | "draw" | null {
    for (const [a, b, c] of WINNING_COMBOS) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a] as "X" | "O";
        }
    }
    if (board.every((cell) => cell !== null)) return "draw";
    return null;
}

function startTurn(game: TTTGame) {
    const code = game.code as string;

    // Clear any existing timer for this game first
    const existing = turnTimers.get(code);
    if (existing) {
        clearTimeout(existing);
        turnTimers.delete(code);
    }

    io.to(code).emit("tttTurnStart", { turn: game.turn, timeLimit: 5 });

    const timer = setTimeout(() => {
        // Delete timer BEFORE calling placeAndAdvance (which may set a new one)
        turnTimers.delete(code);

        // Auto-place at random empty cell
        const emptyCells = game.board
            .map((v, i) => (v === null ? i : -1))
            .filter((i) => i !== -1);
        if (emptyCells.length === 0) return;

        const randomIndex = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        placeAndAdvance(game, randomIndex);
    }, 5000);

    turnTimers.set(code, timer);
}

function placeAndAdvance(game: TTTGame, index: number) {
    const code = game.code as string;
    game.board[index] = game.turn;

    io.to(code).emit("tttMoveMade", { index, mark: game.turn });

    const result = checkWinner(game.board);
    if (result) {
        game.winner = result;
        io.to(code).emit("tttGameOver", {
            winner: result,
            xName: game.playerX?.name,
            oName: game.playerO?.name
        });
        return;
    }

    game.turn = game.turn === "X" ? "O" : "X";

    // Delay before starting the next turn so clients can render the move
    setTimeout(() => startTurn(game), 1500);
}

export function tttJoinLobby(this: Socket, gameCode: string) {
    const game = activeTTTGames.find((g) => g.code === gameCode);
    if (!game) return;

    const userId = this.request.session.user.id;

    if (game.playerX?.id === userId) {
        if (game.playerX) game.playerX.connected = true;
    } else if (game.playerO?.id === userId) {
        if (game.playerO) game.playerO.connected = true;
    } else {
        if (!game.observers) game.observers = [];
        game.observers.push({ id: userId, name: this.request.session.user.name });
    }

    this.join(gameCode);
    io.to(gameCode).emit("tttGameState", game);
}

export function tttJoinAsPlayer(this: Socket) {
    const gameCode = Array.from(this.rooms)[1];
    const game = activeTTTGames.find((g) => g.code === gameCode);
    if (!game) return;

    const userId = this.request.session.user.id;
    const user = { id: userId, name: this.request.session.user.name, connected: true };

    if (game.playerX?.id === userId || game.playerO?.id === userId) return;

    if (!game.playerO) {
        game.playerO = user;
        if (game.observers) {
            game.observers = game.observers.filter((o) => o.id !== userId);
        }

        io.to(gameCode).emit("tttGameState", game);

        // Both players present — start the game
        if (game.playerX && game.playerO && !game.winner) {
            setTimeout(() => startTurn(game), 500);
        }
    }
}

export function tttPlaceMove(this: Socket, index: number) {
    const gameCode = Array.from(this.rooms)[1];
    const game = activeTTTGames.find((g) => g.code === gameCode);
    if (!game || game.winner) return;

    const userId = this.request.session.user.id;
    if (typeof index !== "number" || index < 0 || index > 8) return;
    if (game.board[index] !== null) return;

    // Verify it's this player's turn
    if (game.turn === "X" && game.playerX?.id !== userId) return;
    if (game.turn === "O" && game.playerO?.id !== userId) return;

    // Clear the turn timer
    const timer = turnTimers.get(gameCode);
    if (timer) {
        clearTimeout(timer);
        turnTimers.delete(gameCode);
    }

    placeAndAdvance(game, index);
}

export function tttEndSession(this: Socket) {
    const gameCode = Array.from(this.rooms)[1];
    const game = activeTTTGames.find((g) => g.code === gameCode);
    if (!game || !game.winner) return; // can only end after game over

    const timer = turnTimers.get(gameCode);
    if (timer) {
        clearTimeout(timer);
        turnTimers.delete(gameCode);
    }

    io.to(gameCode).emit("tttSessionEnded");
    activeTTTGames.splice(activeTTTGames.indexOf(game), 1);
}

export function tttContinueSession(this: Socket) {
    const gameCode = Array.from(this.rooms)[1];
    const game = activeTTTGames.find((g) => g.code === gameCode);
    if (!game || !game.winner) return; // can only continue after game over

    // Reset game state
    game.board = Array(9).fill(null);
    game.turn = "X";
    game.winner = null;

    io.to(gameCode).emit("tttSessionContinued");
    io.to(gameCode).emit("tttGameState", game);

    // Start first turn
    if (game.playerX && game.playerO) {
        setTimeout(() => startTurn(game), 500);
    }
}

export function tttLeaveLobby(this: Socket) {
    const gameCode = Array.from(this.rooms)[1];
    if (!gameCode) return;
    const game = activeTTTGames.find((g) => g.code === gameCode);
    if (!game) return;

    const userId = this.request.session.user.id;

    if (game.playerX?.id === userId) {
        if (game.playerX) game.playerX.connected = false;
    } else if (game.playerO?.id === userId) {
        if (game.playerO) game.playerO.connected = false;
    } else {
        if (game.observers) {
            game.observers = game.observers.filter((o) => o.id !== userId);
        }
    }

    this.leave(gameCode);
    io.to(gameCode).emit("tttGameState", game);
}
