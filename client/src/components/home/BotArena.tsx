"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

import { createBotBattle, fetchBotProfiles, fetchBotBattles, BotProfile, BotBattle } from "@/lib/game";

export default function BotArena() {
  const [profiles, setProfiles] = useState<BotProfile[]>([]);
  const [activeBattles, setActiveBattles] = useState<BotBattle[]>([]);
  const [whiteBot, setWhiteBot] = useState<string>("random");
  const [blackBot, setBlackBot] = useState<string>("random");
  const [moveDelay, setMoveDelay] = useState<number>(2000);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    loadProfiles();
    loadBattles();
    
    // Refresh battles every 10 seconds
    const interval = setInterval(loadBattles, 10000);
    return () => clearInterval(interval);
  }, []);

  async function loadProfiles() {
    const result = await fetchBotProfiles();
    if (result) {
      setProfiles(result);
    }
  }

  async function loadBattles() {
    const result = await fetchBotBattles();
    if (result) {
      setActiveBattles(result);
    }
  }

  async function handleStartBattle() {
    setLoading(true);
    const result = await createBotBattle({
      whiteBot: whiteBot === "random" ? undefined : whiteBot,
      blackBot: blackBot === "random" ? undefined : blackBot,
      moveDelay
    });

    if (result) {
      router.push(`/${result.code}`);
    } else {
      setLoading(false);
    }
  }

  function handleSpectate(code: string) {
    router.push(`/${code}`);
  }

  return (
    <div className="card bg-base-200 shadow-xl">
      <div className="card-body">
        <h2 className="card-title">
          Bot Arena
          <div className="badge badge-secondary">SPECTATE</div>
        </h2>
        
        <p className="text-sm opacity-70 mb-4">
          Watch AI bots battle it out! Pick your fighters and spectate.
        </p>

        {/* Bot Selection */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">White Bot</span>
            </label>
            <select 
              className="select select-bordered select-sm"
              value={whiteBot}
              onChange={(e) => setWhiteBot(e.target.value)}
            >
              <option value="random">Random</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          
          <div className="form-control">
            <label className="label">
              <span className="label-text">Black Bot</span>
            </label>
            <select 
              className="select select-bordered select-sm"
              value={blackBot}
              onChange={(e) => setBlackBot(e.target.value)}
            >
              <option value="random">Random</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Speed Control */}
        <div className="form-control mb-4">
          <label className="label">
            <span className="label-text">Move Speed</span>
            <span className="label-text-alt">{(moveDelay / 1000).toFixed(1)}s per move</span>
          </label>
          <input 
            type="range" 
            min="500" 
            max="5000" 
            step="500"
            value={moveDelay}
            onChange={(e) => setMoveDelay(parseInt(e.target.value))}
            className="range range-primary range-sm" 
          />
          <div className="w-full flex justify-between text-xs px-2">
            <span>Fast</span>
            <span>Slow</span>
          </div>
        </div>

        {/* Start Button */}
        <button 
          className={`btn btn-primary ${loading ? 'loading' : ''}`}
          onClick={handleStartBattle}
          disabled={loading}
        >
          {loading ? 'Starting...' : 'Start Bot Battle'}
        </button>

        {/* Active Battles */}
        {activeBattles.length > 0 && (
          <div className="mt-6">
            <h3 className="font-bold mb-2">Live Battles</h3>
            <div className="space-y-2">
              {activeBattles.map(battle => (
                <div 
                  key={battle.code}
                  className="flex items-center justify-between bg-base-300 p-2 rounded-lg"
                >
                  <div className="text-sm">
                    <span className="font-medium">{battle.whiteBot}</span>
                    <span className="opacity-50 mx-2">vs</span>
                    <span className="font-medium">{battle.blackBot}</span>
                  </div>
                  <button 
                    className="btn btn-xs btn-ghost"
                    onClick={() => handleSpectate(battle.code)}
                  >
                    Watch →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
