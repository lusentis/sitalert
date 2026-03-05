"use server";

import { cookies } from "next/headers";

export async function dismissOnboarding() {
  const cookieStore = await cookies();
  cookieStore.set("travelrisk-onboarding", "1", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
