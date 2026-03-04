"use client";

import { parseAsString, useQueryState } from "nuqs";
import { useCallback } from "react";

const options = { shallow: true } as const;

export function useDeepLink() {
  const [situationId, setSituationId] = useQueryState(
    "situation",
    parseAsString.withOptions(options),
  );
  const [eventId, setEventId] = useQueryState(
    "event",
    parseAsString.withOptions(options),
  );

  const selectSituation = useCallback(
    (id: string | null) => {
      setSituationId(id);
      if (id) setEventId(null);
    },
    [setSituationId, setEventId],
  );

  const selectEvent = useCallback(
    (id: string | null) => {
      setEventId(id);
      if (id) setSituationId(null);
    },
    [setEventId, setSituationId],
  );

  const clear = useCallback(() => {
    setSituationId(null);
    setEventId(null);
  }, [setSituationId, setEventId]);

  return {
    situationId,
    eventId,
    selectSituation,
    selectEvent,
    clear,
  };
}
