import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@ecomdash/database";

export default async function RootPage() {
  const { userId, orgId } = auth();

  if (!userId) {
    redirect("/sign-in");
  }

  if (!orgId) {
    redirect("/sign-in");
  }

  const shopCount = await prisma.shop.count({
    where: { organizationId: orgId },
  });

  if (shopCount === 0) {
    redirect("/onboarding");
  }

  redirect("/overview");
}
