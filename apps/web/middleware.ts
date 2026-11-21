import { NextRequest, NextResponse } from "next/server";

const PUBLIC = [/^\/login/, /^\/invite\//];

/**
 * Sends visitors without a session cookie to /login. The API remains the authority (every call checks the session);
 * this only avoids flashing an empty dashboard. The cookie is set by the API — same site as the web app (12 §6).
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  if (req.cookies.has("ecomdash_session")) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next|api|.*\\..*).*)"] };
