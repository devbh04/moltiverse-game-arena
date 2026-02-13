"use client";

import { IconRefresh } from "@tabler/icons-react";
import { useState } from "react";

export default function RefreshButton({ onRefresh }: { onRefresh?: () => Promise<void> }) {
  const [isLoading, setIsLoading] = useState(false);

  async function handleRefresh() {
    if (onRefresh) {
      setIsLoading(true);
      await onRefresh();
      setIsLoading(false);
    }
  }

  return (
    <button
      aria-label="Refresh public games"
      className={"btn btn-sm btn-square btn-ghost" + (isLoading ? " loading" : "")}
      onClick={handleRefresh}
    >
      <IconRefresh size={16} />
    </button>
  );
}
