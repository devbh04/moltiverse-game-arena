import type { Socket } from "socket.io";
import type { RPSGame } from "@chessu/types";
import { io } from "../server.js";
import { activeRPSGames } from "../controllers/minigames.controller.js";

// Timers keyed by game code
const roundTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

function resolveRound(game: RPSGame) {
    const p1 = game.picks?.p1;
    const p2 = game.picks?.p2;
    if (!p1 || !p2) return;

    let roundWinner: "p1" | "p2" | "draw" = "draw";
    if (p1 !== p2) {
        if (
            (p1 === "rock" && p2 === "scissors") ||
            (p1 === "paper" && p2 === "rock") ||
            (p1 === "scissors" && p2 === "paper")
        ) {
            roundWinner = "p1";
        } else {
            roundWinner = "p2";
        }
    }

    if (roundWinner === "p1") game.scores.p1++;
    else if (roundWinner === "p2") game.scores.p2++;

    game.roundResults?.push({ p1Pick: p1, p2Pick: p2, winner: roundWinner });
    game.roundState = "reveal";

    io.to(game.code as string).emit("rpsRoundResult", {
        p1Pick: p1,
        p2Pick: p2,
        winner: roundWinner,
        scores: game.scores,
        round: game.round
    });

    // Check if game is over (best of 3 = first to 2)
    if (game.scores.p1 >= 2 || game.scores.p2 >= 2 || game.round >= 3) {
        game.roundState = "done";
        if (game.scores.p1 > game.scores.p2) game.winner = "player1";
        else if (game.scores.p2 > game.scores.p1) game.winner = "player2";
        else game.winner = "draw";

        io.to(game.code as string).emit("rpsGameOver", {
            winner: game.winner,
            scores: game.scores,
            p1Name: game.player1?.name,
            p2Name: game.player2?.name
        });
    } else {
        // Start next round after 2s reveal delay
        setTimeout(() => {
            startRound(game);
        }, 2000);
    }
}

function randomPick(): "rock" | "paper" | "scissors" {
    const choices: Array<"rock" | "paper" | "scissors"> = ["rock", "paper", "scissors"];
    return choices[Math.floor(Math.random() * 3)];
}

function startRound(game: RPSGame) {
    game.round++;
    game.roundState = "picking";
    game.picks = { p1: undefined, p2: undefined };

    io.to(game.code as string).emit("rpsRoundStart", { round: game.round, timeLimit: 3 });

    // 3-second timer
    const timer = setTimeout(() => {
        // Auto-pick for anyone who hasn't picked
        if (!game.picks?.p1) game.picks!.p1 = randomPick();
        if (!game.picks?.p2) game.picks!.p2 = randomPick();
        resolveRound(game);
        roundTimers.delete(game.code as string);
    }, 3000);

    roundTimers.set(game.code as string, timer);
}

export function rpsJoinLobby(this: Socket, gameCode: string) {
    const game = activeRPSGames.find((g) => g.code === gameCode);
    if (!game) return;

    const userId = this.request.session.user.id;

    // Reconnect or add as observer
    if (game.player1?.id === userId) {
        if (game.player1) game.player1.connected = true;
    } else if (game.player2?.id === userId) {
        if (game.player2) game.player2.connected = true;
    } else {
        if (!game.observers) game.observers = [];
        game.observers.push({ id: userId, name: this.request.session.user.name });
    }

    this.join(gameCode);
    io.to(gameCode).emit("rpsGameState", game);
}

export function rpsJoinAsPlayer(this: Socket) {
    const gameCode = Array.from(this.rooms)[1];
    const game = activeRPSGames.find((g) => g.code === gameCode);
    if (!game) return;

    const userId = this.request.session.user.id;
    const user = { id: userId, name: this.request.session.user.name, connected: true };

    if (game.player1?.id === userId || game.player2?.id === userId) return; // already a player

    if (!game.player2) {
        game.player2 = user;
        // Remove from observers
        if (game.observers) {
            game.observers = game.observers.filter((o) => o.id !== userId);
        }

        io.to(gameCode).emit("rpsGameState", game);

        // Both players present — start round 1
        if (game.player1 && game.player2 && game.roundState === "waiting") {
            setTimeout(() => startRound(game), 500);
        }
    }
}

export function rpsPick(this: Socket, choice: "rock" | "paper" | "scissors") {
    const gameCode = Array.from(this.rooms)[1];
    const game = activeRPSGames.find((g) => g.code === gameCode);
    if (!game || game.roundState !== "picking") return;

    const userId = this.request.session.user.id;
    const validChoices = ["rock", "paper", "scissors"];
    if (!validChoices.includes(choice)) return;

    if (game.player1?.id === userId && !game.picks?.p1) {
        game.picks!.p1 = choice;
        io.to(gameCode).emit("rpsPlayerLocked", { player: "p1" });
    } else if (game.player2?.id === userId && !game.picks?.p2) {
        game.picks!.p2 = choice;
        io.to(gameCode).emit("rpsPlayerLocked", { player: "p2" });
    }

    // If both picked, resolve immediately
    if (game.picks?.p1 && game.picks?.p2) {
        const timer = roundTimers.get(gameCode);
        if (timer) {
            clearTimeout(timer);
            roundTimers.delete(gameCode);
        }
        resolveRound(game);
    }
}

export function rpsEndSession(this: Socket) {
    const gameCode = Array.from(this.rooms)[1];
    const game = activeRPSGames.find((g) => g.code === gameCode);
    if (!game || !game.winner) return; // can only end after game is done

    const timer = roundTimers.get(gameCode);
    if (timer) {
        clearTimeout(timer);
        roundTimers.delete(gameCode);
    }

    io.to(gameCode).emit("rpsSessionEnded");
    activeRPSGames.splice(activeRPSGames.indexOf(game), 1);
}

export function rpsContinueSession(this: Socket) {
    const gameCode = Array.from(this.rooms)[1];
    const game = activeRPSGames.find((g) => g.code === gameCode);
    if (!game || !game.winner) return; // can only continue after game is done

    // Reset game state
    game.scores = { p1: 0, p2: 0 };
    game.round = 0;
    game.roundState = "waiting";
    game.picks = {};
    game.roundResults = [];
    game.winner = null;

    io.to(gameCode).emit("rpsSessionContinued");
    io.to(gameCode).emit("rpsGameState", game);

    // Start first round
    if (game.player1 && game.player2) {
        setTimeout(() => startRound(game), 500);
    }
}

export function rpsLeaveLobby(this: Socket) {
    const gameCode = Array.from(this.rooms)[1];
    if (!gameCode) return;
    const game = activeRPSGames.find((g) => g.code === gameCode);
    if (!game) return;

    const userId = this.request.session.user.id;

    if (game.player1?.id === userId) {
        if (game.player1) game.player1.connected = false;
    } else if (game.player2?.id === userId) {
        if (game.player2) game.player2.connected = false;
    } else {
        if (game.observers) {
            game.observers = game.observers.filter((o) => o.id !== userId);
        }
    }

    this.leave(gameCode);
    io.to(gameCode).emit("rpsGameState", game);
}
