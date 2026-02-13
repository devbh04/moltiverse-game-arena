"use client";

import { useEffect, useState } from "react";
import type { Game } from "@chessu/types";
import { API_URL } from "@/config";
import GameCard from "./GameCard";
import RefreshButton from "./RefreshButton";

export default function PublicGames() {
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

  return (
    <div className="flex w-full flex-col items-center">
      <h2 className="mb-4 text-2xl font-bold leading-tight">
        Live Games <RefreshButton onRefresh={fetchGames} />
      </h2>

      {games.length > 0 ? (
        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {games.map((game) => (
            <GameCard key={game.code} game={game} />
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
