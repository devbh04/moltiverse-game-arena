"use client";

import { FormEvent, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SessionContext } from "@/context/session";
import { API_URL } from "@/config";
import type { RPSGame, TTTGame } from "@chessu/types";

import CreateGame from "@/components/home/CreateGame";
import PublicGames from "@/components/home/PublicGames/PublicGames";
import BotArena from "@/components/home/BotArena";
import { fetchActiveGame } from "@/lib/game";

type GameTab = "chess" | "rps" | "ttt" | null;

const GAME_RULES: Record<string, string[]> = {
  chess: [
    "Standard chess rules apply",
    "Each player starts with 16 pieces",
    "Checkmate your opponent to win",
    "Draw by stalemate, repetition, or agreement",
  ],
  rps: [
    "Best of 3 rounds",
    "3 seconds to lock your pick each round",
    "Rock beats Scissors, Scissors beats Paper, Paper beats Rock",
    "First to 2 wins takes the match",
  ],
  ttt: [
    "Players alternate placing X and O",
    "5 seconds per turn — think fast!",
    "Get 3 in a row (horizontal, vertical, or diagonal) to win",
    "If the board fills with no winner, it's a draw",
  ],
};

export default function Home() {
  const session = useContext(SessionContext);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<GameTab>(null);

  // RPS state
  const [rpsGames, setRpsGames] = useState<RPSGame[]>([]);
  const [rpsJoinCode, setRpsJoinCode] = useState("");
  const [rpsCreating, setRpsCreating] = useState(false);

  // TTT state
  const [tttGames, setTttGames] = useState<TTTGame[]>([]);
  const [tttJoinCode, setTttJoinCode] = useState("");
  const [tttCreating, setTttCreating] = useState(false);

  // Chess join state
  const [chessJoinCode, setChessJoinCode] = useState("");
  const [chessJoinLoading, setChessJoinLoading] = useState(false);
  const [chessNotFound, setChessNotFound] = useState(false);

  // Fetch live games for RPS & TTT
  useEffect(() => {
    async function fetchRPS() {
      try {
        const res = await fetch(`${API_URL}/v1/minigames/rps`, { credentials: "include" });
        if (res.ok) setRpsGames(await res.json());
      } catch { /* ignore */ }
    }
    async function fetchTTT() {
      try {
        const res = await fetch(`${API_URL}/v1/minigames/ttt`, { credentials: "include" });
        if (res.ok) setTttGames(await res.json());
      } catch { /* ignore */ }
    }
    fetchRPS();
    fetchTTT();
    const interval = setInterval(() => { fetchRPS(); fetchTTT(); }, 5000);
    return () => clearInterval(interval);
  }, []);

  function selectGame(tab: GameTab) {
    setActiveTab((prev) => (prev === tab ? null : tab));
  }

  // Chess join handler
  async function handleChessJoin(e: FormEvent) {
    e.preventDefault();
    if (!session?.user?.id || !chessJoinCode.trim()) return;
    setChessJoinLoading(true);
    let code = chessJoinCode.trim();
    if (code.includes("/")) {
      try {
        if (!code.startsWith("http")) code = "http://" + code;
        code = new URL(code).pathname.split("/")[1];
      } catch { /* */ }
    }
    const game = await fetchActiveGame(code);
    if (game?.code) {
      router.push(`/${game.code}`);
    } else {
      setChessJoinLoading(false);
      setChessNotFound(true);
      setTimeout(() => setChessNotFound(false), 3000);
    }
  }

  // RPS handlers
  async function handleRpsCreate() {
    if (!session?.user?.id) return;
    setRpsCreating(true);
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
    } catch { /* ignore */ }
    setRpsCreating(false);
  }

  function handleRpsJoin(e: FormEvent) {
    e.preventDefault();
    if (!rpsJoinCode.trim()) return;
    let code = rpsJoinCode.trim();
    if (code.includes("/")) {
      try {
        if (!code.startsWith("http")) code = "http://" + code;
        code = new URL(code).pathname.split("/").pop() || code;
      } catch { /* ignore */ }
    }
    router.push(`/rps/${code}`);
  }

  // TTT handlers
  async function handleTttCreate() {
    if (!session?.user?.id) return;
    setTttCreating(true);
    try {
      const res = await fetch(`${API_URL}/v1/minigames/ttt`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const { code } = await res.json();
        router.push(`/ttt/${code}`);
      }
    } catch { /* ignore */ }
    setTttCreating(false);
  }

  function handleTttJoin(e: FormEvent) {
    e.preventDefault();
    if (!tttJoinCode.trim()) return;
    let code = tttJoinCode.trim();
    if (code.includes("/")) {
      try {
        if (!code.startsWith("http")) code = "http://" + code;
        code = new URL(code).pathname.split("/").pop() || code;
      } catch { /* ignore */ }
    }
    router.push(`/ttt/${code}`);
  }

  // Get the join form for the currently selected game
  function getJoinPlaceholder() {
    if (activeTab === "chess") return "e.g. 8X92mP";
    if (activeTab === "rps") return "e.g. abc123";
    if (activeTab === "ttt") return "e.g. xyz789";
    return "Select a game first";
  }

  function handleJoinSubmit(e: FormEvent) {
    if (activeTab === "chess") return handleChessJoin(e);
    if (activeTab === "rps") return handleRpsJoin(e);
    if (activeTab === "ttt") return handleTttJoin(e);
    e.preventDefault();
  }

  function getJoinCode() {
    if (activeTab === "chess") return chessJoinCode;
    if (activeTab === "rps") return rpsJoinCode;
    if (activeTab === "ttt") return tttJoinCode;
    return "";
  }

  function setJoinCode(val: string) {
    if (activeTab === "chess") setChessJoinCode(val);
    if (activeTab === "rps") setRpsJoinCode(val);
    if (activeTab === "ttt") setTttJoinCode(val);
  }

  return (
    <div className="flex w-full flex-col items-center gap-10 px-4 py-10">

      {/* ─── Top section: Start a New Game + Join via Code ─── */}
      <div className="flex w-full flex-col lg:flex-row gap-6">

        {/* Left — Start a New Game */}
        <div className="flex-1 bg-base-200 rounded-2xl border border-base-300 p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold">Start a New Game</h2>
              <p className="text-sm text-base-content/50 mt-1">
                Create a room and invite friends instantly.
              </p>
            </div>
          </div>

          {/* Game selector cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Chess card */}
            <button
              onClick={() => selectGame("chess")}
              className={
                "flex flex-col items-center gap-3 rounded-xl border p-5 transition-all cursor-pointer " +
                (activeTab === "chess"
                  ? "border-primary bg-primary/10 shadow-md shadow-primary/10"
                  : "border-base-300 bg-base-100 hover:border-base-content/20 hover:bg-base-300/50")
              }
            >
              <img src="/android-chrome-192x192.png" alt="Chess" className="h-12 w-12" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).insertAdjacentHTML('afterend', '<span class="text-4xl">♟️</span>'); }} />
              <span className="font-semibold text-sm">Chess</span>
              <span className="text-xs text-base-content/50">Strategic Battle</span>
            </button>

            {/* RPS card */}
            <button
              onClick={() => selectGame("rps")}
              className={
                "flex flex-col items-center gap-3 rounded-xl border p-5 transition-all cursor-pointer " +
                (activeTab === "rps"
                  ? "border-primary bg-primary/10 shadow-md shadow-primary/10"
                  : "border-base-300 bg-base-100 hover:border-base-content/20 hover:bg-base-300/50")
              }
            >
              <img src="/rpc/rock.png" alt="RPS" className="h-12 w-12 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).insertAdjacentHTML('afterend', '<span class="text-4xl">🪨</span>'); }} />
              <span className="font-semibold text-sm">Rock Paper Scissors</span>
              <span className="text-xs text-base-content/50">Quick & Fun</span>
            </button>

            {/* TTT card */}
            <button
              onClick={() => selectGame("ttt")}
              className={
                "flex flex-col items-center gap-3 rounded-xl border p-5 transition-all cursor-pointer " +
                (activeTab === "ttt"
                  ? "border-primary bg-primary/10 shadow-md shadow-primary/10"
                  : "border-base-300 bg-base-100 hover:border-base-content/20 hover:bg-base-300/50")
              }
            >
              <img src="/ttt/X.png" alt="Tic Tac Toe" className="h-12 w-12 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).insertAdjacentHTML('afterend', '<span class="text-4xl">❌</span>'); }} />
              <span className="font-semibold text-sm">Tic Tac Toe</span>
              <span className="text-xs text-base-content/50">Classic Puzzle</span>
            </button>
          </div>

          {/* Rules — shown inside this card when a game is selected */}
          <div
            className="overflow-hidden transition-all duration-400 ease-in-out"
            style={{
              maxHeight: activeTab ? "300px" : "0px",
              opacity: activeTab ? 1 : 0,
            }}
          >
            {activeTab && (
              <div className="mt-5 pt-5 border-t border-base-300">
                <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                  📋 Rules
                </h3>
                <ul className="space-y-1.5">
                  {GAME_RULES[activeTab].map((rule, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-base-content/70">
                      <span className="text-primary mt-0.5">•</span>
                      {rule}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Right — Join via Code */}
        <div className="w-full h-min lg:w-80 bg-base-200 rounded-2xl border border-base-300 p-6 flex flex-col">
          <h2 className="text-xl font-bold">Join via Code</h2>
          <p className="text-sm text-base-content/50 mt-1 mb-5">
            Enter an invite code to jump directly into a private lobby.
          </p>

          <form className="flex flex-col gap-3" onSubmit={handleJoinSubmit}>
            <input
              type="text"
              placeholder={getJoinPlaceholder()}
              className={"input input-bordered w-full" + (chessNotFound && activeTab === "chess" ? " input-error" : "")}
              value={getJoinCode()}
              onChange={(e) => setJoinCode(e.target.value)}
              disabled={!activeTab}
            />
            {chessNotFound && activeTab === "chess" && (
              <p className="text-xs text-error">Game not found</p>
            )}
            <button
              className={
                "btn btn-primary w-full" +
                (!activeTab || !session?.user?.id ? " btn-disabled" : "") +
                (chessJoinLoading && activeTab === "chess" ? " loading" : "")
              }
              type="submit"
            >
              Join Session →
            </button>
          </form>

          <div className="divider text-xs text-base-content/40 my-4">Or create a new game</div>

          {/* Game-specific create controls */}
          {activeTab === "chess" && (
            <div className="flex flex-col gap-2">
              <CreateGame />
            </div>
          )}
          {activeTab === "rps" && (
            <button
              className={
                "btn btn-primary btn-sm w-full" +
                (rpsCreating ? " loading" : "") +
                (!session?.user?.id ? " btn-disabled" : "")
              }
              onClick={handleRpsCreate}
            >
              Create RPS Game
            </button>
          )}
          {activeTab === "ttt" && (
            <button
              className={
                "btn btn-primary btn-sm w-full" +
                (tttCreating ? " loading" : "") +
                (!session?.user?.id ? " btn-disabled" : "")
              }
              onClick={handleTttCreate}
            >
              Create TTT Game
            </button>
          )}
          {!activeTab && (
            <button className="btn btn-outline btn-sm w-full btn-disabled">
              Select a game first
            </button>
          )}
        </div>
      </div>

      {/* ─── Animated reveal: BotArena (chess only) ─── */}
      <div
        className="w-full md:w-1/2 overflow-hidden transition-all duration-500 ease-in-out"
        style={{
          maxHeight: activeTab === "chess" ? "800px" : "0px",
          opacity: activeTab === "chess" ? 1 : 0,
          transform: activeTab === "chess" ? "translateY(0)" : "translateY(-12px)",
        }}
      >
        {activeTab === "chess" && <BotArena />}
      </div>

      {/* ─── Live Games ─── */}
      <PublicGames rpsGames={rpsGames} tttGames={tttGames} />
    </div>
  );
}
