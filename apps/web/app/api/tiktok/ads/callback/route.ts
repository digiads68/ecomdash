import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export async function GET(req: NextRequest) {
  const { userId } = auth();

  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  const { searchParams } = new URL(req.url);
  // TikTok Ads uses "auth_code" in the callback
  const code = searchParams.get("auth_code") ?? searchParams.get("code");
  const advertiserId = searchParams.get("advertiser_id");
  const stateRaw = searchParams.get("state");

  if (!code) {
    return NextResponse.redirect(
      new URL("/settings?tab=integrations&error=ads_oauth_cancelled", req.url)
    );
  }

  let orgId: string | null = null;
  try {
    const decoded = JSON.parse(Buffer.from(stateRaw ?? "", "base64").toString());
    orgId = decoded.orgId;
  } catch {
    // orgId will be null
  }

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
    const res = await fetch(`${apiUrl}/tiktok/ads/callback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-org-id": orgId ?? "",
      },
      body: JSON.stringify({ code, advertiserId, orgId }),
    });

    if (!res.ok) {
      throw new Error(`Backend error: ${res.status}`);
    }

    return NextResponse.redirect(
      new URL("/settings?tab=integrations&connected=ads", req.url)
    );
  } catch {
    return NextResponse.redirect(
      new URL("/settings?tab=integrations&error=ads_connect_failed", req.url)
    );
  }
}
