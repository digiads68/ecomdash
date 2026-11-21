import { createHash, randomBytes } from "crypto";
import type { Response } from "express";
import { prisma } from "@ecomdash/database";
import { config } from "../config";

export const SESSION_COOKIE = "ecomdash_session";
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createSession(userId: string, userAgent?: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: { userId, tokenHash: sha256(token), userAgent: userAgent?.slice(0, 200), expiresAt: new Date(Date.now() + config().SESSION_DAYS * 86_400_000) },
  });
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  return token;
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config().APP_URL.startsWith("https://"),
    maxAge: config().SESSION_DAYS * 86_400_000,
    path: "/",
  });
}

export function expireSessionCookie(res: Response) {
  res.cookie(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", maxAge: 0, path: "/" });
}

/** Browser cookie, or `Authorization: Bearer <session token>` for scripts. */
export function readToken(req: { headers: Record<string, string | string[] | undefined> }): string | null {
  const auth = req.headers.authorization as string | undefined;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const cookie = (req.headers.cookie as string | undefined) ?? "";
  const m = cookie.split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return m ? decodeURIComponent(m.slice(SESSION_COOKIE.length + 1)) : null;
}

export async function userForToken(token: string) {
  const s = await prisma.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!s || s.expiresAt < new Date() || s.user.status !== "ACTIVE") return null;
  return { session: s, user: s.user };
}
