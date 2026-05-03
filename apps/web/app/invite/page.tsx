"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

type State = "idle" | "loading" | "success" | "error";

export default function InvitePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [state, setState] = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // If no token present, show invalid link immediately
  const noToken = !token;

  async function handleAccept() {
    if (!token) return;
    setState("loading");
    try {
      const res = await fetch("/api/team/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Yêu cầu thất bại");
      }

      setState("success");
      setTimeout(() => {
        router.push("/overview");
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.message || "Link đã hết hạn hoặc không hợp lệ");
      setState("error");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Ecom<span className="text-[#3B82F6]">Dash</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">TikTok Shop + Ads Analytics</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {noToken ? (
            /* ── Invalid link ── */
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle className="w-6 h-6 text-red-500" />
              </div>
              <h2 className="text-base font-semibold text-gray-900">Link không hợp lệ</h2>
              <p className="text-sm text-gray-500">
                Liên kết lời mời này không hợp lệ. Vui lòng liên hệ người đã mời bạn để nhận
                liên kết mới.
              </p>
            </div>
          ) : state === "success" ? (
            /* ── Success ── */
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>
              <h2 className="text-base font-semibold text-gray-900">Tham gia thành công!</h2>
              <p className="text-sm text-gray-500">Đang chuyển hướng đến bảng điều khiển...</p>
              <Loader2 className="w-4 h-4 text-gray-400 animate-spin mt-1" />
            </div>
          ) : state === "error" ? (
            /* ── Error ── */
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle className="w-6 h-6 text-red-500" />
              </div>
              <h2 className="text-base font-semibold text-gray-900">
                Link đã hết hạn hoặc không hợp lệ
              </h2>
              <p className="text-sm text-gray-500">{errorMsg}</p>
              <button
                onClick={() => setState("idle")}
                className="mt-2 text-sm text-[#3B82F6] hover:underline"
              >
                Thử lại
              </button>
            </div>
          ) : (
            /* ── Default / Idle ── */
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-xl">👋</span>
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  Bạn được mời tham gia EcomDash
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Nhấn nút bên dưới để chấp nhận lời mời và bắt đầu hợp tác.
                </p>
              </div>
              <button
                onClick={handleAccept}
                disabled={state === "loading"}
                className="w-full py-2.5 rounded-lg bg-[#3B82F6] text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {state === "loading" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Đang xử lý...
                  </>
                ) : (
                  "Chấp nhận lời mời"
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
