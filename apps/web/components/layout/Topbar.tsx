"use client";

import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import { BellButton } from "./BellButton";
import { NotificationPanel } from "./NotificationPanel";
import { useUIStore } from "@/lib/stores/ui-store";

export function Topbar() {
  const { notificationPanelOpen, setNotificationPanelOpen } = useUIStore();

  return (
    <>
      <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <OrganizationSwitcher
            appearance={{
              elements: {
                organizationSwitcherTrigger: "text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg px-3 py-2",
              },
            }}
          />
        </div>

        <div className="flex items-center gap-3">
          <BellButton onClick={() => setNotificationPanelOpen(true)} />
          <UserButton afterSignOutUrl="/sign-in" />
        </div>
      </header>

      <NotificationPanel
        open={notificationPanelOpen}
        onClose={() => setNotificationPanelOpen(false)}
      />
    </>
  );
}
