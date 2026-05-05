import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";

const SESSION_COOKIE_NAME = "sliceo_session";

export async function getOrCreateSessionId() {
  const cookieStore = await cookies();
  const existing = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (existing) return existing;

  const sessionId = randomUUID();
  cookieStore.set(SESSION_COOKIE_NAME, sessionId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
  });
  return sessionId;
}
