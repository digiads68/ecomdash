"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { DEMO } from "@/lib/auth-mode";
import { useCurrentOrgId, useMe } from "@/lib/api";

/** Pages that work before both platforms are linked. */
const OPEN = [/^\/settings/, /^\/admin/];

/**
 * Until TikTok Shop and TikTok Ads are both linked (or the client said they don't run ads), data pages show
 * a "finish linking" card — revenue without ad spend would make ROAS and net profit wrong (12 §3.1).
 */
function CompleteLinking({ orgName, shop, ads }: { orgName: string; shop: boolean; ads: boolean }) {
  return (
    <div className="mx-auto mt-6 w-full max-w-xl rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
      <div className="text-lg font-semibold text-gray-900">Hoàn tất kết nối để xem Dashboard</div>
      <p className="mt-1 text-sm text-gray-500">{orgName} cần gắn cả TikTok Shop và TikTok Ads để doanh thu và chi phí quảng cáo khớp cùng một khung số liệu.</p>
      <ol className="mx-auto mt-4 grid max-w-sm gap-2 text-left text-sm">
        <li className={shop ? "text-green-700" : "text-gray-800"}>{shop ? "✓" : "1."} TikTok Shop (Seller Center)</li>
        <li className={ads ? "text-green-700" : "text-gray-800"}>{ads ? "✓" : "2."} TikTok Ads (TikTok for Business)</li>
      </ol>
      <Link href="/onboarding" className="mt-5 inline-block rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600">Tiếp tục kết nối</Link>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const me = useMe();
  const orgId = useCurrentOrgId();
  const org = me.data?.organizations.find((o) => o.id === orgId) ?? (me.data?.organizations.length === 1 ? me.data.organizations[0] : undefined);
  const gate = org && org.role && !org.status.ready && !OPEN.some((r) => r.test(path));
  return (
    <div className="lg:grid lg:min-h-screen lg:grid-cols-[236px_minmax(0,1fr)] lg:bg-[linear-gradient(to_right,#111827_236px,transparent_236px)]">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-col">
        {DEMO && <div className="bg-amber-100 px-4 py-1.5 text-[13px] text-amber-900 lg:px-6">Chế độ demo — dữ liệu giả lập từ mock TikTok API, đi qua đúng luồng đồng bộ thật.</div>}
        <Topbar onMenu={() => setOpen(true)} />
        <main className="flex flex-col gap-[18px] px-4 pb-12 pt-[22px] lg:px-6">
          {gate ? <CompleteLinking orgName={org.name} shop={org.status.shopLinked} ads={org.status.adsLinked || org.status.adsMode === "NONE"} /> : children}
        </main>
      </div>
    </div>
  );
}
