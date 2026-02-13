import CreateGame from "@/components/home/CreateGame";
import JoinGame from "@/components/home/JoinGame";
import PublicGames from "@/components/home/PublicGames/PublicGames";

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

      {/* Bottom section: Live games grid */}
      <PublicGames />
    </div>
  );
}
