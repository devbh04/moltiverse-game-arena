"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useContext, useState } from "react";

import { SessionContext } from "@/context/session";
import { createGame } from "@/lib/game";

export default function CreateGame() {
  const session = useContext(SessionContext);
  const [buttonLoading, setButtonLoading] = useState(false);
  const router = useRouter();

  async function submitCreateGame(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!session?.user?.id) return;
    setButtonLoading(true);

    const target = e.target as HTMLFormElement;
    const startingSide = (target.elements.namedItem("createStartingSide") as HTMLSelectElement)
      .value;

    const game = await createGame(startingSide);

    if (game) {
      router.push(`/${game.code}`);
    } else {
      setButtonLoading(false);
      // TODO: Show error message
    }
  }

  return (
    <form className="form-control" onSubmit={submitCreateGame}>
      <div className="input-group space-x-2">
        <select
          className="select select-bordered"
          name="createStartingSide"
          id="createStartingSide"
        >
          <option value="random">Random</option>
          <option value="white">White</option>
          <option value="black">Black</option>
        </select>
        <button
          className={
            "btn" +
            (buttonLoading ? " loading" : "") +
            (!session?.user?.id ? " btn-disabled text-base-content" : "")
          }
          type="submit"
        >
          Create
        </button>
      </div>
    </form>
  );
}
