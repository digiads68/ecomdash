import { create } from "zustand";

interface UIState {
  notificationPanelOpen: boolean;
  sidebarOpen: boolean;
  setNotificationPanelOpen: (open: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  notificationPanelOpen: false,
  sidebarOpen: false,
  setNotificationPanelOpen: (open) => set({ notificationPanelOpen: open }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
