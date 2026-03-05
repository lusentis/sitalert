"use client";

import { useState, useTransition } from "react";
import { dismissOnboarding } from "@/app/actions";

export function useOnboardingDismissed(initialDismissed: boolean) {
  const [dismissed, setDismissed] = useState(initialDismissed);
  const [, startTransition] = useTransition();

  const dismiss = () => {
    setDismissed(true);
    startTransition(() => {
      dismissOnboarding();
    });
  };

  return { dismissed, dismiss };
}
