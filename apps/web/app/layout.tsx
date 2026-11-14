import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const font = Be_Vietnam_Pro({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "600", "700"], display: "swap", fallback: ["Segoe UI", "system-ui", "sans-serif"] });

export const metadata: Metadata = {
  title: "EcomDash — Điều hành lãi lỗ TikTok Shop",
  description: "Lãi lỗ thực, ROAS thực và chi phí của shop TikTok trên một màn hình",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={font.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
