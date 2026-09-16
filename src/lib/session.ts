import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  authenticated: boolean;
  loggedInAt?: number;
}

export const SESSION_COOKIE = "pmp_session";

export function sessionOptions(): SessionOptions {
  return {
    password: process.env.SESSION_SECRET ?? "",
    cookieName: SESSION_COOKIE,
    ttl: 60 * 60 * 24 * 30, // 30 days — one private user, one phone
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
  };
}

export async function getSession() {
  const store = await cookies();
  return getIronSession<SessionData>(store, sessionOptions());
}

export async function isAuthenticated(): Promise<boolean> {
  const s = await getSession();
  return s.authenticated === true;
}
