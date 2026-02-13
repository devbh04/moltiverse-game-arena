"use client";

import { useRouter } from "next/navigation";
import { useContext, useTransition } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import type { Game } from "@chessu/types";

import { SessionContext } from "@/context/session";

export default function GameCard({ game }: { game: Game }) {
    const router = useRouter();
    const session = useContext(SessionContext);
    const [isLoading, startTransition] = useTransition();

    // Determine current board position from PGN
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

    function handleAction() {
        startTransition(() => {
            router.push(`/${game.code}`);
        });
    }

    return (
        <div className="bg-base-200 group flex flex-col items-center rounded-xl p-3 transition-all hover:scale-[1.02] hover:shadow-lg">
            {/* Mini chessboard */}
            <div className="pointer-events-none w-[180px]">
                <Chessboard
                    boardWidth={180}
                    position={chess.fen()}
                    arePiecesDraggable={false}
                    customDarkSquareStyle={{ backgroundColor: "#4b7399" }}
                    customLightSquareStyle={{ backgroundColor: "#eae9d2" }}
                    animationDuration={0}
                />
            </div>

            {/* Player info */}
            <div className="mt-2 flex w-full items-center justify-between gap-2 px-1 text-xs">
                <div className="flex items-center gap-1 truncate">
                    <span className="inline-block h-2.5 w-2.5 rounded-full border border-gray-400 bg-white"></span>
                    <span className={`truncate ${hasWhite ? "text-primary font-medium" : "opacity-50"}`}>
                        {whiteName}
                    </span>
                </div>
                <span className="text-base-content/40 text-[10px]">vs</span>
                <div className="flex items-center gap-1 truncate">
                    <span className="inline-block h-2.5 w-2.5 rounded-full border border-gray-400 bg-gray-800"></span>
                    <span className={`truncate ${hasBlack ? "text-primary font-medium" : "opacity-50"}`}>
                        {blackName}
                    </span>
                </div>
            </div>

            {/* Action button */}
            <button
                className={
                    "btn btn-sm mt-2 w-full" +
                    (isFull ? " btn-ghost" : " btn-secondary") +
                    (isLoading ? " btn-disabled" : "") +
                    (!session?.user?.id ? " btn-disabled text-base-content" : "")
                }
                onClick={handleAction}
            >
                {isFull ? "Spectate" : "Join"}
            </button>
        </div>
    );
}
