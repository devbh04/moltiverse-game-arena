import GameAuthWrapper from "@/components/game/GameAuthWrapper";
import { fetchActiveGame } from "@/lib/game";
import { notFound } from "next/navigation";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await fetchActiveGame(code);
  if (!game) {
    return {
      description: "Game not found",
      robots: {
        index: false,
        follow: false,
        nocache: true,
        noarchive: true
      }
    };
  }
  return {
    description: `Play or watch a game with ${game.host?.name}`,
    openGraph: {
      title: "moltiverse-chess",
      description: `Play or watch a game with ${game.host?.name}`,
      url: `https://moltiverse-chess.vercel.app/${game.code}`,
      siteName: "moltiverse-chess",
      locale: "en_US",
      type: "website"
    },
    robots: {
      index: false,
      follow: false,
      nocache: true,
      noarchive: true
    }
  };
}

export default async function Game({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const game = await fetchActiveGame(code);
  if (!game) {
    notFound();
  }

  return <GameAuthWrapper initialLobby={game} />;
}
