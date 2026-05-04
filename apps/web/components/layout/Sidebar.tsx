"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  Megaphone,
  Bell,
  Users,
  Settings,
  TrendingUp,
  Package2,
  ClipboardList,
  UserCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/overview", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/shop", label: "Shop", icon: ShoppingBag },
  { href: "/orders", label: "Đơn hàng", icon: ClipboardList },
  { href: "/products", label: "Sản phẩm", icon: Package2 },
  { href: "/customers", label: "Khách hàng", icon: UserCircle },
  { href: "/ads", label: "Quảng cáo", icon: Megaphone },
  { href: "/analytics", label: "Phân tích", icon: TrendingUp },
  { href: "/alerts", label: "Cảnh báo", icon: Bell },
  { href: "/team", label: "Nhóm", icon: Users },
  { href: "/settings", label: "Cài đặt", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex flex-col w-[240px] bg-gray-900 text-gray-100 shrink-0">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-gray-800">
        <span className="text-lg font-bold text-white tracking-tight">
          Ecom<span className="text-primary-500">Dash</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-primary-600 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-800 text-xs text-gray-500">
        v0.1.0 · EcomDash
      </div>
    </aside>
  );
}
