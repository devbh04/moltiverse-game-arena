"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useContext, useEffect, useState } from "react";
import { SessionContext } from "@/context/session";
import { API_URL } from "@/config";
import type { RPSGame } from "@chessu/types";

export default function RPSHome() {
    const session = useContext(SessionContext);
    const router = useRouter();
    const [games, setGames] = useState<RPSGame[]>([]);
    const [joinCode, setJoinCode] = useState("");
    const [creating, setCreating] = useState(false);

    async function fetchGames() {
        try {
            const res = await fetch(`${API_URL}/v1/minigames/rps`, { credentials: "include" });
            if (res.ok) setGames(await res.json());
        } catch {
            // ignore
        }
    }

    useEffect(() => {
        fetchGames();
        const interval = setInterval(fetchGames, 5000);
        return () => clearInterval(interval);
    }, []);

    async function handleCreate() {
        if (!session?.user?.id) return;
        setCreating(true);
        try {
            const res = await fetch(`${API_URL}/v1/minigames/rps`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            if (res.ok) {
                const { code } = await res.json();
                router.push(`/rps/${code}`);
            }
        } catch {
            // ignore
        }
        setCreating(false);
    }

    function handleJoin(e: FormEvent) {
        e.preventDefault();
        if (!joinCode.trim()) return;
        let code = joinCode.trim();
        if (code.includes("/")) {
            try {
                if (!code.startsWith("http")) code = "http://" + code;
                code = new URL(code).pathname.split("/").pop() || code;
            } catch {
                // ignore
            }
        }
        router.push(`/rps/${code}`);
    }

    return (
        <div className="flex w-full flex-col items-center gap-10 px-4 py-10">
            <h1 className="text-3xl font-bold">🪨 Rock Paper Scissors</h1>
            <p className="text-base-content/60">Best of 3 — 3 seconds to lock your pick!</p>

            <div className="flex w-full flex-wrap items-start justify-center gap-8 lg:gap-16">
                <div className="flex flex-col items-center">
                    <h2 className="mb-4 text-xl font-bold">Join from code</h2>
                    <form className="input-group space-x-2" onSubmit={handleJoin}>
                        <input
                            type="text"
                            placeholder="Game code"
                            className="input input-bordered"
                            value={joinCode}
                            onChange={(e) => setJoinCode(e.target.value)}
                        />
                        <button
                            className={"btn" + (!session?.user?.id ? " btn-disabled text-base-content" : "")}
                            type="submit"
                        >
                            Join
                        </button>
                    </form>
                </div>

                <div className="divider divider-horizontal hidden md:flex">or</div>
                <div className="divider divider-vertical md:hidden">or</div>

                <div className="flex flex-col items-center">
                    <h2 className="mb-4 text-xl font-bold">Create game</h2>
                    <button
                        className={"btn btn-primary" + (creating ? " loading" : "") + (!session?.user?.id ? " btn-disabled" : "")}
                        onClick={handleCreate}
                    >
                        Create RPS Game
                    </button>
                </div>
            </div>

            {/* Live games */}
            <div className="w-full max-w-4xl">
                <h2 className="mb-4 text-center text-xl font-bold">Live Games</h2>
                {games.length === 0 ? (
                    <p className="text-center text-base-content/50">No active games right now.</p>
                ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {games.map((g) => (
                            <div key={g.code} className="card bg-base-200 shadow-md">
                                <div className="card-body p-4">
                                    <p className="font-mono text-sm">{g.code}</p>
                                    <p className="text-sm">
                                        {g.player1?.name || "Waiting..."} vs {g.player2?.name || "Waiting..."}
                                    </p>
                                    <p className="text-xs text-base-content/60">
                                        Round {g.round}/3 — Score: {g.scores.p1}-{g.scores.p2}
                                    </p>
                                    <button
                                        className="btn btn-sm btn-primary mt-2"
                                        onClick={() => router.push(`/rps/${g.code}`)}
                                    >
                                        {!g.player2 ? "Join" : "Spectate"}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
