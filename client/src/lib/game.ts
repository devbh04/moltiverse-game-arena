import { API_URL } from "@/config";
import type { Game } from "@chessu/types";

export const createGame = async (side: string) => {
    try {
        const res = await fetch(`${API_URL}/v1/games`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ side }),
            cache: "no-store"
        });

        if (res && res.status === 201) {
            const game: Game = await res.json();
            return game;
        }
    } catch (err) {
        console.error(err);
    }
};

export const fetchActiveGame = async (code: string) => {
    try {
        const res = await fetch(`${API_URL}/v1/games/${code}`, { cache: "no-store" });

        if (res && res.status === 200) {
            const game: Game = await res.json();
            return game;
        }
    } catch (err) {
        console.error(err);
    }
};

export const fetchPublicGames = async () => {
    try {
        const res = await fetch(`${API_URL}/v1/games`, { cache: "no-store" });

        if (res && res.status === 200) {
            const games: Game[] = await res.json();
            return games;
        }
    } catch (err) {
        console.error(err);
    }
};

export const fetchArchivedGame = async ({ id, userid }: { id?: number; userid?: number }) => {
    let url = `${API_URL}/v1/games?`;
    if (id) {
        url += `id=${id}`;
    } else {
        url += `userid=${userid}`;
    }
    try {
        // TODO: handle caching more efficiently
        const res = await fetch(url, {
            next: { revalidate: 20 }
        });

        if (res && res.status === 200) {
            if (id) {
                const game: Game = await res.json();
                if (game.id) return game;
            } else {
                const games: Game[] = await res.json();
                if (games.length && games[0].id) return games;
            }
        }
    } catch (err) {
        console.error(err);
    }
};

export const createGameWithBot = async (side: string) => {
    try {
        const res = await fetch(`${API_URL}/v1/games/bot`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ side }),
            cache: "no-store"
        });

        if (res && res.status === 201) {
            const game: { code: string; vsBot: boolean } = await res.json();
            return game;
        }
    } catch (err) {
        console.error(err);
    }
};

export const requestBotJoin = async (code: string) => {
    try {
        const res = await fetch(`${API_URL}/v1/games/bot/join/${code}`, {
            method: "POST",
            credentials: "include",
            cache: "no-store"
        });

        if (res && res.status === 200) {
            const result: { success: boolean; message: string } = await res.json();
            return result;
        }
    } catch (err) {
        console.error(err);
    }
};

// ============== BOT BATTLE (Agent vs Agent) ==============

export interface BotProfile {
    id: string;
    name: string;
    style: string;
}

export interface BotBattle {
    code: string;
    whiteBot: string;
    blackBot: string;
    moveDelay: number;
}

export const createBotBattle = async (options: {
    whiteBot?: string;
    blackBot?: string;
    moveDelay?: number;
} = {}) => {
    try {
        const res = await fetch(`${API_URL}/v1/games/battle`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(options),
            cache: "no-store"
        });

        if (res && res.status === 201) {
            const result: {
                success: boolean;
                code: string;
                white: string;
                black: string;
                spectateUrl: string;
            } = await res.json();
            return result;
        }
    } catch (err) {
        console.error(err);
    }
};

export const fetchBotBattles = async () => {
    try {
        const res = await fetch(`${API_URL}/v1/games/battle`, { cache: "no-store" });

        if (res && res.status === 200) {
            const result: { battles: BotBattle[] } = await res.json();
            return result.battles;
        }
    } catch (err) {
        console.error(err);
    }
};

export const fetchBotProfiles = async () => {
    try {
        const res = await fetch(`${API_URL}/v1/games/battle/profiles`, { cache: "no-store" });

        if (res && res.status === 200) {
            const result: { profiles: BotProfile[] } = await res.json();
            return result.profiles;
        }
    } catch (err) {
        console.error(err);
    }
};

export const checkIsBotBattle = async (code: string) => {
    try {
        const res = await fetch(`${API_URL}/v1/games/battle/${code}/check`, { cache: "no-store" });

        if (res && res.status === 200) {
            const result: { isBotBattle: boolean } = await res.json();
            return result.isBotBattle;
        }
    } catch (err) {
        console.error(err);
    }
    return false;
};
