/** Centered card used by /login, /invite and /onboarding. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-5 text-center">
          <div className="text-2xl font-bold tracking-tight text-gray-900">Ecom<span className="text-primary-500">Dash</span></div>
          <div className="text-sm text-gray-500">Dashboard TikTok Shop — DigiAds</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
