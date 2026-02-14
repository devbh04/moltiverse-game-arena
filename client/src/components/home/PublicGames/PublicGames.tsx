"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Game, RPSGame, TTTGame } from "@chessu/types";
import { API_URL } from "@/config";
import GameCard from "./GameCard";
import RefreshButton from "./RefreshButton";

export default function PublicGames({
  rpsGames = [],
  tttGames = [],
}: {
  rpsGames?: RPSGame[];
  tttGames?: TTTGame[];
}) {
  const router = useRouter();
  const [games, setGames] = useState<Game[]>([]);

  async function fetchGames() {
    try {
      const res = await fetch(`${API_URL}/v1/games`, { cache: "no-store" });
      if (res.ok) {
        const data: Game[] = await res.json();
        setGames(data);
      }
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    fetchGames();
    const interval = setInterval(fetchGames, 5000);
    return () => clearInterval(interval);
  }, []);

  const totalCount = games.length + rpsGames.length + tttGames.length;

  return (
    <div className="flex w-full flex-col items-center">
      <h2 className="mb-4 text-2xl font-bold leading-tight flex items-center gap-2">
        Live Games
        <RefreshButton onRefresh={fetchGames} />
      </h2>

      {totalCount > 0 ? (
        <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Chess games */}
          {games.map((game) => (
            <GameCard key={`chess-${game.code}`} game={game} />
          ))}

          {/* RPS games */}
          {rpsGames.map((g) => (
            <div
              key={`rps-${g.code}`}
              className="bg-base-200 rounded-xl border border-base-300 p-4 hover:border-primary/50 transition-colors cursor-pointer flex flex-col"
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-pink-400 text-lg">✂️</span>
                  <span className="text-sm font-semibold">Rock Paper Scissors</span>
                </div>
                <span className="bg-base-300 text-xs px-2 py-1 rounded text-base-content/60">
                  Round {g.round}/3
                </span>
              </div>

              {/* Preview area — triangle layout */}
              <div className="h-36 bg-base-300/50 rounded-lg mb-4 flex items-center justify-center relative">
                {/* Top center */}
                <img src="/rpc/paper.png" alt="Paper" className="h-14 absolute top-4 left-1/2 -translate-x-1/2 z-20" />
                {/* Bottom left */}
                <img src="/rpc/rock.png" alt="Rock" className="h-14 absolute bottom-4 left-[20%] z-20" />
                {/* Bottom right */}
                <img src="/rpc/scissors.png" alt="Scissors" className="h-16 absolute bottom-4 right-[20%] z-20" />
              </div>

              {/* Footer */}
              <div className="flex justify-between items-center mt-auto">
                <div className="flex -space-x-2">
                  {g.player1 && (
                    <div className="w-6 h-6 rounded-full bg-blue-500 border-2 border-base-200 text-[8px] flex items-center justify-center text-white font-bold">
                      {g.player1.name?.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                  {g.player2 && (
                    <div className="w-6 h-6 rounded-full bg-purple-500 border-2 border-base-200 text-[8px] flex items-center justify-center text-white font-bold">
                      {g.player2.name?.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                  {!g.player1 && !g.player2 && (
                    <span className="text-xs text-base-content/50">Waiting...</span>
                  )}
                </div>
                <button
                  className={
                    "px-4 py-1.5 text-xs font-medium rounded transition-colors " +
                    (g.player2
                      ? "border border-base-300 text-base-content/70 hover:bg-base-300"
                      : "bg-primary text-primary-content hover:brightness-110")
                  }
                  onClick={() => router.push(`/rps/${g.code}`)}
                >
                  {!g.player2 ? "Join" : "Spectate"}
                </button>
              </div>
            </div>
          ))}

          {/* TTT games */}
          {tttGames.map((g) => (
            <div
              key={`ttt-${g.code}`}
              className="bg-base-200 rounded-xl border border-base-300 p-4 hover:border-primary/50 transition-colors cursor-pointer flex flex-col"
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-teal-400 text-lg">#️⃣</span>
                  <span className="text-sm font-semibold">Tic Tac Toe</span>
                </div>
                <span className="bg-red-900/30 text-red-400 text-xs px-2 py-1 rounded flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
                  Live
                </span>
              </div>

              {/* Preview area — mini board */}
              <div className="h-36 bg-base-300/50 rounded-lg mb-4 flex items-center justify-center relative">
                <div className="grid grid-cols-3 gap-1 w-32 h-32">
                  {g.board.map((cell, i) => (
                    <div
                      key={i}
                      className="bg-base-300 rounded-sm flex items-center justify-center text-lg font-bold"
                    >
                      {cell === "X" && <span className="text-blue-400">X</span>}
                      {cell === "O" && <span className="text-red-400">O</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-between items-center mt-auto">
                <div className="flex flex-col">
                  <span className="text-xs font-medium">Room: {g.code}</span>
                  <span className="text-[10px] text-base-content/50">
                    Turn: {g.turn} ({g.turn === "X" ? g.playerX?.name || "?" : g.playerO?.name || "?"})
                  </span>
                </div>
                <button
                  className={
                    "px-4 py-1.5 text-xs font-medium rounded transition-colors " +
                    (g.playerO
                      ? "border border-base-300 text-base-content/70 hover:bg-base-300"
                      : "bg-primary text-primary-content hover:brightness-110")
                  }
                  onClick={() => router.push(`/ttt/${g.code}`)}
                >
                  {!g.playerO ? "Join" : "Spectate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-base-200 flex h-80 w-full items-center justify-center rounded-xl px-8 py-12">
          <p className="text-base-content/50 text-sm">No live games right now. Create one above!</p>
        </div>
      )}
    </div>
  );
}
