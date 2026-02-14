"use client";

import { useRouter } from "next/navigation";
import { useContext, useTransition } from "react";
import { Chess } from "chess.js";
import type { Game } from "@chessu/types";

import { SessionContext } from "@/context/session";

export default function GameCard({ game }: { game: Game }) {
    const router = useRouter();
    const session = useContext(SessionContext);
    const [isLoading, startTransition] = useTransition();

    const chess = new Chess();
    if (game.pgn) {
        try {
            chess.loadPgn(game.pgn);
        } catch {
            // fallback to starting position
        }
    }

    const hasWhite = !!game.white?.id;
    const hasBlack = !!game.black?.id;
    const isFull = hasWhite && hasBlack;

    const whiteName = game.white?.name || "Waiting...";
    const blackName = game.black?.name || "Waiting...";
    const moveCount = chess.history().length;

    function handleAction() {
        startTransition(() => {
            router.push(`/${game.code}`);
        });
    }

    return (
        <div className="bg-base-200 rounded-xl border border-base-300 p-4 hover:border-primary/50 transition-colors cursor-pointer flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                    <span className="text-indigo-400 text-lg">♟️</span>
                    <span className="text-sm font-semibold">Chess Arena</span>
                </div>
                {isFull && (
                    <span className="bg-base-300 text-xs px-2 py-1 rounded text-base-content/60">
                        Move {moveCount}
                    </span>
                )}
            </div>

            {/* Preview area */}
            <div className="h-36 bg-base-300/50 rounded-lg mb-4 flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center gap-6">
                    <div className="text-center flex flex-col gap-2 items-center justify-center">
                        <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-sm text-xs font-bold mb-1 text-gray-800">
                            W
                        </div>
                        <span className={`text-xs ${hasWhite ? "text-base-content" : "text-base-content/40"}`}>
                            {whiteName}
                        </span>
                    </div>
                    <span className="text-xs font-bold text-base-content/40">VS</span>
                    <div className="text-center flex flex-col gap-2 items-center justify-center">
                        <div className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center shadow-sm text-white text-xs font-bold mb-1 border border-gray-600">
                            B
                        </div>
                        <span className={`text-xs ${hasBlack ? "text-base-content" : "text-base-content/40"}`}>
                            {blackName}
                        </span>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center mt-auto">
                <span className="text-xs text-base-content/50">
                    {isFull ? `In progress` : "Waiting for opponent..."}
                </span>
                <button
                    className={
                        "px-4 py-1.5 text-xs font-medium rounded transition-colors " +
                        (isFull
                            ? "border border-base-300 text-base-content/70 hover:bg-base-300"
                            : "bg-primary text-primary-content hover:brightness-110") +
                        (isLoading ? " opacity-50 pointer-events-none" : "") +
                        (!session?.user?.id ? " opacity-50 pointer-events-none" : "")
                    }
                    onClick={handleAction}
                >
                    {isFull ? "Spectate" : "Join"}
                </button>
            </div>
        </div>
    );
}
