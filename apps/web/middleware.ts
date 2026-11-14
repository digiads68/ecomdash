import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublic = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

/** Clerk only guards the app when NEXT_PUBLIC_AUTH_MODE=clerk; demo mode needs no keys. */
export default process.env.NEXT_PUBLIC_AUTH_MODE === "clerk"
  ? clerkMiddleware((auth, req) => { if (!isPublic(req)) auth().protect(); })
  : () => NextResponse.next();

export const config = { matcher: ["/((?!_next|.*\\..*).*)"] };
