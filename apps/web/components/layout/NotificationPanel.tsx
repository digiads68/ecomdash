"use client";

import { X, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { useNotifications } from "@/lib/hooks/useNotifications";
import { cn } from "@/lib/utils";
import type { AlertInstanceDto } from "@ecomdash/shared";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
}

function AlertItem({ alert, onAck }: { alert: AlertInstanceDto; onAck: (id: string) => void }) {
  const isFiring = alert.state === "FIRING";
  const isAcknowledged = !!alert.acknowledgedAt;

  return (
    <div
      className={cn(
        "p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors",
        isFiring && !isAcknowledged && "bg-red-50/40"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {isFiring ? (
            <AlertTriangle className="w-4 h-4 text-red-500" />
          ) : (
            <CheckCircle className="w-4 h-4 text-green-500" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{alert.ruleName}</p>
          {alert.metadata && Object.keys(alert.metadata).length > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">
              {(alert.metadata as any).metric}: {(alert.metadata as any).currentValue} (ngưỡng: {(alert.metadata as any).threshold})
            </p>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <Clock className="w-3 h-3 text-gray-400" />
            <span className="text-xs text-gray-400">
              {formatDistanceToNow(new Date(alert.firedAt), { addSuffix: true, locale: vi })}
            </span>
            {isFiring && !isAcknowledged && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700 uppercase tracking-wide">
                Đang kích hoạt
              </span>
            )}
          </div>
        </div>
        {isFiring && !isAcknowledged && (
          <button
            onClick={() => onAck(alert.id)}
            className="shrink-0 text-xs text-primary-600 hover:text-primary-800 font-medium"
          >
            Xác nhận
          </button>
        )}
      </div>
    </div>
  );
}

export function NotificationPanel({ open, onClose }: NotificationPanelProps) {
  const { alerts, firingCount, acknowledgeAlert } = useNotifications();

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Cảnh báo</h2>
            {firingCount > 0 && (
              <p className="text-xs text-red-600 mt-0.5">{firingCount} đang kích hoạt</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Alert List */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <CheckCircle className="w-8 h-8 mb-2 text-green-300" />
              <p className="text-sm">Không có cảnh báo nào</p>
            </div>
          ) : (
            alerts.map((alert) => (
              <AlertItem key={alert.id} alert={alert} onAck={acknowledgeAlert} />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200">
          <a href="/alerts" className="block text-center text-sm text-primary-600 hover:text-primary-800 font-medium">
            Quản lý cảnh báo →
          </a>
        </div>
      </div>
    </>
  );
}
