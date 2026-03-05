"use client";

import { parseAsFloat, parseAsString, useQueryStates } from "nuqs";

const deepLinkParsers = {
  situation: parseAsString,
  event: parseAsString,
  advisory: parseAsString,
  alat: parseAsFloat,
  alng: parseAsFloat,
};

const options = { shallow: true } as const;

export function useDeepLink() {
  const [state, setState] = useQueryStates(deepLinkParsers, options);

  const selectSituation = (id: string | null) => {
    setState({
      situation: id,
      event: null,
      advisory: null,
      alat: null,
      alng: null,
    });
  };

  const selectEvent = (id: string | null) => {
    setState({
      situation: id ? null : state.situation,
      event: id,
      advisory: id ? null : state.advisory,
      alat: id ? null : state.alat,
      alng: id ? null : state.alng,
    });
  };

  const selectAdvisory = (countryCode: string | null, lngLat?: { lng: number; lat: number }) => {
    setState({
      situation: null,
      event: null,
      advisory: countryCode,
      alat: lngLat?.lat ?? null,
      alng: lngLat?.lng ?? null,
    });
  };

  const clear = () => {
    setState({
      situation: null,
      event: null,
      advisory: null,
      alat: null,
      alng: null,
    });
  };

  return {
    situationId: state.situation,
    eventId: state.event,
    advisoryCode: state.advisory,
    advisoryLngLat:
      state.advisory && state.alat != null && state.alng != null
        ? { lng: state.alng, lat: state.alat }
        : null,
    selectSituation,
    selectEvent,
    selectAdvisory,
    clear,
  };
}
