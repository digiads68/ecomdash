"use client";

import { useState } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { DEMO } from "@/lib/auth-mode";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:grid lg:min-h-screen lg:grid-cols-[236px_minmax(0,1fr)] lg:bg-[linear-gradient(to_right,#111827_236px,transparent_236px)]">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-col">
        {DEMO && <div className="bg-amber-100 px-4 py-1.5 text-[13px] text-amber-900 lg:px-6">Chế độ demo — dữ liệu giả lập từ mock TikTok API, đi qua đúng luồng đồng bộ thật.</div>}
        <Topbar onMenu={() => setOpen(true)} />
        <main className="flex flex-col gap-[18px] px-4 pb-12 pt-[22px] lg:px-6">{children}</main>
      </div>
    </div>
  );
}
