import { BadRequestException } from "@nestjs/common";
import * as jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { config } from "../config";

/**
 * OAuth `state` payload (signed, 30 min).
 * - login:   "Đăng nhập bằng TikTok Shop" — sign up or sign in by the seller's open_id
 * - connect: attach the authorization to orgId (client's own button, or an admin's link sent to the client)
 * - agency:  DigiAds Business Center connection (TikTok for Business only)
 */
export interface OAuthState {
  intent: "login" | "connect" | "agency";
  orgId?: string;
  byUserId?: string;
  returnTo?: string;
}

export function signState(s: OAuthState, expiresIn: string | number = "30m"): string {
  return jwt.sign({ ...s, nonce: randomBytes(6).toString("hex") }, config().STATE_JWT_SECRET, { expiresIn } as jwt.SignOptions);
}

export function verifyState(state: string | undefined): OAuthState | null {
  if (!state) return null;
  try {
    return jwt.verify(state, config().STATE_JWT_SECRET) as OAuthState;
  } catch {
    throw new BadRequestException("Liên kết uỷ quyền đã hết hạn hoặc không hợp lệ, vui lòng thử lại");
  }
}
