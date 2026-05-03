import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export async function GET(req: NextRequest) {
  const { userId } = auth();

  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const shopId = searchParams.get("shop_id");
  const stateRaw = searchParams.get("state");

  if (!code) {
    return NextResponse.redirect(
      new URL("/settings?tab=integrations&error=shop_oauth_cancelled", req.url)
    );
  }

  // Decode orgId from state param set in getShopAuthUrl()
  let orgId: string | null = null;
  try {
    const decoded = JSON.parse(Buffer.from(stateRaw ?? "", "base64").toString());
    orgId = decoded.orgId;
  } catch {
    // orgId will be null, backend will reject
  }

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
    const res = await fetch(`${apiUrl}/tiktok/shop/callback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Pass orgId via header so ClerkGuard-less endpoint can read it
        "x-org-id": orgId ?? "",
      },
      body: JSON.stringify({ code, shopId, orgId }),
    });

    if (!res.ok) {
      throw new Error(`Backend error: ${res.status}`);
    }

    return NextResponse.redirect(
      new URL("/settings?tab=integrations&connected=shop", req.url)
    );
  } catch {
    return NextResponse.redirect(
      new URL("/settings?tab=integrations&error=shop_connect_failed", req.url)
    );
  }
}
