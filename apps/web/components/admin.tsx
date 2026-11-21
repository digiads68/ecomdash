import type { AdminOrgRowDto } from "@ecomdash/shared";
import { Badge } from "@/components/ui";

/** Shop / Ads link state of a client organisation. */
export function LinkBadges({ s }: { s: AdminOrgRowDto["status"] }) {
  return (
    <div className="flex flex-wrap gap-1">
      <Badge tone={s.shopLinked ? "green" : "red"}>Shop {s.shopLinked ? `✓ ${s.shopCount}` : "chưa gắn"}</Badge>
      {s.adsMode === "NONE" ? <Badge tone="gray">Không chạy QC</Badge> : <Badge tone={s.adsLinked ? (s.storeLinksComplete ? "green" : "amber") : "red"}>Ads {s.adsLinked ? (s.storeLinksComplete ? `✓ ${s.advertiserCount}` : "store chưa khớp") : "chưa gắn"}</Badge>}
    </div>
  );
}

export const SOURCE_LABEL: Record<string, string> = { SELF_SIGNUP: "Khách tự đăng ký", APP_STORE: "App Store (không qua EcomDash)", ADMIN_LINK: "Link DigiAds gửi", CLIENT: "Token của khách", AGENCY_BC: "BC DigiAds" };
