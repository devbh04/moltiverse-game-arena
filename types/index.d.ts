export interface Game {
    id?: number;
    pgn?: string;
    white?: User;
    black?: User;
    winner?: "white" | "black" | "draw";
    endReason?: "draw" | "checkmate" | "stalemate" | "repetition" | "insufficient" | "abandoned" | "resign";
    drawOffer?: "white" | "black";
    host?: User;
    code?: string;
    timeout?: number;
    observers?: User[];
    startedAt?: number;
    endedAt?: number;
}

export interface User {
    id?: number | string; // string for guest IDs
    name?: string | null;
    email?: string;
    wins?: number;
    losses?: number;
    draws?: number;

    // mainly for players, not spectators
    connected?: boolean;
    disconnectedOn?: number;
}

export interface RPSGame {
    code?: string;
    host?: User;
    player1?: User;
    player2?: User;
    scores: { p1: number; p2: number };
    round: number;
    roundState: "waiting" | "picking" | "reveal" | "done";
    picks?: { p1?: "rock" | "paper" | "scissors"; p2?: "rock" | "paper" | "scissors" };
    roundResults?: Array<{ p1Pick: string; p2Pick: string; winner: "p1" | "p2" | "draw" }>;
    winner?: "player1" | "player2" | "draw" | null;
    observers?: User[];
}

export interface TTTGame {
    code?: string;
    host?: User;
    playerX?: User;
    playerO?: User;
    board: (string | null)[];
    turn: "X" | "O";
    winner?: "X" | "O" | "draw" | null;
    observers?: User[];
}

