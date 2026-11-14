import { SignIn } from "@clerk/nextjs";
import { redirect } from "next/navigation";

export default function Page() {
  if (process.env.NEXT_PUBLIC_AUTH_MODE !== "clerk") redirect("/overview");
  return <div className="grid min-h-screen place-items-center"><SignIn /></div>;
}
