import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">
            Ecom<span className="text-primary-500">Dash</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">TikTok Shop + Ads Analytics</p>
        </div>
        <SignIn
          appearance={{
            elements: {
              formButtonPrimary: "bg-primary-600 hover:bg-primary-700",
              footerActionLink: "text-primary-600 hover:text-primary-700",
            },
          }}
        />
      </div>
    </div>
  );
}
