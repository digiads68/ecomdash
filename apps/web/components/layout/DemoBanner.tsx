"use client";

import { FlaskConical } from "lucide-react";

export function DemoBanner() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return null;

  return (
    <div className="bg-amber-400 text-amber-900 px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium">
      <FlaskConical className="w-4 h-4 shrink-0" />
      <span>
        Chế độ Demo — dữ liệu tổng hợp, không kết nối TikTok thật.{" "}
        <span className="font-semibold">Mọi thao tác kết nối đều được giả lập.</span>
      </span>
    </div>
  );
}
