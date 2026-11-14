"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV: { group: string; items: { href: string; label: string; isNew?: boolean }[] }[] = [
  { group: "Điều hành", items: [{ href: "/overview", label: "Lãi lỗ" }, { href: "/profit/products", label: "Lãi lỗ sản phẩm", isNew: true }] },
  { group: "Bán hàng", items: [{ href: "/orders", label: "Đơn hàng" }, { href: "/products", label: "Sản phẩm" }, { href: "/returns", label: "Hoàn / Huỷ", isNew: true }, { href: "/customers", label: "Khách hàng" }] },
  { group: "Tiền", items: [{ href: "/finance", label: "Đối soát", isNew: true }, { href: "/ads", label: "Quảng cáo" }] },
  { group: "Vận hành", items: [{ href: "/alerts", label: "Cảnh báo" }, { href: "/reports", label: "Báo cáo định kỳ" }] },
  { group: "Cài đặt", items: [{ href: "/settings/costs", label: "Chi phí", isNew: true }, { href: "/settings/connections", label: "Kết nối", isNew: true }] },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const path = usePathname();
  return (
    <>
      <div className={cn("fixed inset-0 z-20 bg-black/40 lg:hidden", open ? "block" : "hidden")} onClick={onClose} />
      <aside className={cn("fixed inset-y-0 left-0 z-30 w-[236px] overflow-y-auto bg-gray-900 px-3 py-[18px] text-gray-300 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <Link href="/overview" className="block px-2.5 pb-4 text-lg font-bold tracking-tight text-white">Ecom<span className="text-primary-400">Dash</span></Link>
        <nav>
          {NAV.map((g) => (
            <div key={g.group}>
              <div className="px-2.5 pb-1.5 pt-3.5 text-[11px] uppercase tracking-wider text-gray-500">{g.group}</div>
              {g.items.map((it) => {
                const active = path === it.href || (it.href !== "/overview" && path.startsWith(`${it.href}/`));
                return (
                  <Link key={it.href} href={it.href} onClick={onClose}
                    className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2 font-medium", active ? "bg-primary-600 text-white" : "hover:bg-white/5")}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-50" />
                    {it.label}
                    {it.isNew && <span className={cn("ml-auto rounded-full px-1.5 text-[10px]", active ? "bg-white/20 text-white" : "bg-primary-400/20 text-primary-300")}>mới</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
