"use client";

import { useEffect } from "react";

// Inside a Farcaster / Base mini app host the splash screen stays up until
// ready() is called. Outside a host this does nothing.
export default function MiniAppReady() {
  useEffect(() => {
    let cancelled = false;
    import("@farcaster/miniapp-sdk")
      .then(async ({ sdk }) => {
        if (!cancelled && (await sdk.isInMiniApp())) await sdk.actions.ready();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
