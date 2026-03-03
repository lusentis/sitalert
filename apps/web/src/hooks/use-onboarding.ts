"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "travelrisk-onboarding-v1";

export function useOnboardingDismissed() {
  // Default to dismissed on SSR to prevent hydration flash
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== "1") {
      setDismissed(false);
    }
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "1");
    setDismissed(true);
  }, []);

  return { dismissed, dismiss };
}
