"use client";

import { useState, useEffect, useTransition } from "react";
import { dismissOnboarding } from "@/app/actions";

const COOKIE_NAME = "travelrisk-onboarding";

export function useOnboardingDismissed() {
  // Start hidden (no flash), then show only if cookie confirms not dismissed
  const [show, setShow] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!document.cookie.includes(`${COOKIE_NAME}=1`)) {
      setShow(true);
    }
  }, []);

  const dismiss = () => {
    setShow(false);
    startTransition(() => {
      dismissOnboarding();
    });
  };

  return { dismissed: !show, dismiss };
}
