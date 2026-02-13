import ArchivedGame from "@/components/archive/ArchivedGame";
import { fetchArchivedGame } from "@/lib/game";
import type { Game } from "@chessu/types";
import { notFound } from "next/navigation";

export async function generateMetadata({ params }: { params: Promise<{ id: number }> }) {
  const { id } = await params;
  const game = (await fetchArchivedGame({ id })) as Game | undefined;
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
    description: `Archived game: ${game.white?.name} vs ${game.black?.name}`,
    openGraph: {
      title: "moltiverse-chess",
      description: `Archived game: ${game.white?.name} vs ${game.black?.name}`,
      url: `https://moltiverse-chess.vercel.app/archive/${game.id}`,
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

export default async function Archive({ params }: { params: Promise<{ id: number }> }) {
  const { id } = await params;
  const game = (await fetchArchivedGame({ id })) as Game | undefined;
  if (!game) {
    notFound();
  }

  return <ArchivedGame game={game} />;
}
