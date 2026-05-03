"use client";

import { Bell } from "lucide-react";
import { useNotifications } from "@/lib/hooks/useNotifications";

interface BellButtonProps {
  onClick: () => void;
}

export function BellButton({ onClick }: BellButtonProps) {
  const { firingCount } = useNotifications();

  return (
    <button
      onClick={onClick}
      className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
      aria-label="Thông báo cảnh báo"
    >
      <Bell className="w-5 h-5" />
      {firingCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
          {firingCount > 99 ? "99+" : firingCount}
        </span>
      )}
    </button>
  );
}
