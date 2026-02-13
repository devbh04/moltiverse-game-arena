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
