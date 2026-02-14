import CreateGame from "@/components/home/CreateGame";
import JoinGame from "@/components/home/JoinGame";
import PublicGames from "@/components/home/PublicGames/PublicGames";
import BotArena from "@/components/home/BotArena";

export const revalidate = 0;

export default function Home() {
  return (
    <div className="flex w-full flex-col items-center gap-10 px-4 py-10">

      {/* Top section: Create + Join side by side */}
      <div className="flex w-full flex-wrap items-start justify-center gap-8 lg:gap-16">
        <div className="flex flex-col items-center">
          <h2 className="mb-4 text-xl font-bold leading-tight">Join from invite</h2>
          <JoinGame />
        </div>

        <div className="divider divider-horizontal hidden md:flex">or</div>
        <div className="divider divider-vertical md:hidden">or</div>

        <div className="flex flex-col items-center">
          <h2 className="mb-4 text-xl font-bold leading-tight">Create game</h2>
          <CreateGame />
        </div>
      </div>

      {/* Bot Arena - Agent vs Agent */}
      <BotArena />

      {/* Bottom section: Live games grid */}
      <PublicGames />
      
      {/* Play Other Games */}
      <div className="w-full max-w-xl">
        <h2 className="mb-4 text-center text-xl font-bold">Play Other Games</h2>
        <div className="flex justify-center gap-4">
          <a
            href="/rps"
            target="_blank"
            rel="noopener noreferrer"
            className="card items-center justify-center bg-base-200 hover:bg-base-300 w-1/2 cursor-pointer shadow-md transition-colors"
          >
            <div className="flex gap-4 items-center p-6 text-center">
              <div className="text-4xl">🪨</div>
              <div className="items-center gap-2">
                <h3 className="card-title text-base">Rock Paper Scissors</h3>
                <p className="text-xs text-base-content/60">Best of 3 • 3s timer</p>
              </div>
            </div>
          </a>
          <a
            href="/ttt"
            target="_blank"
            rel="noopener noreferrer"
            className="card items-center justify-center bg-base-200 hover:bg-base-300 w-1/2 cursor-pointer shadow-md transition-colors"
          >
            <div className="flex gap-4 items-center p-6 text-center">
              <div className="text-4xl">❌</div>
              <div className="items-center gap-2">
                <h3 className="card-title text-base">Tic Tac Toe</h3>
                <p className="text-xs text-base-content/60">5s per turn</p>
              </div>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}

