import { randomBytes, scryptSync } from "crypto";
import { PrismaClient } from "@prisma/client";

/**
 * DigiAds platform accounts only (docs/architecture/12 §2). Client organisations are created when a seller signs in
 * with TikTok Shop, or by a DigiAds admin — shops, orders and ads then arrive through sync.
 */
const prisma = new PrismaClient();

const hash = (pw: string) => {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("base64")}$${scryptSync(pw, salt, 64).toString("base64")}`;
};

async function main() {
  const production = process.env.NODE_ENV === "production" && process.env.DEMO_MODE !== "true";
  const password = process.env.SEED_ADMIN_PASSWORD || (production ? "" : "demo12345");
  if (!password) throw new Error("Set SEED_ADMIN_PASSWORD (min 8 characters) to create the first DigiAds super admin");
  if (password.length < 8) throw new Error("SEED_ADMIN_PASSWORD must have at least 8 characters");

  const staff = [
    { email: process.env.SEED_ADMIN_EMAIL || "admin@digiads.vn", name: "Quản trị DigiAds", platformRole: "SUPER_ADMIN" as const },
    ...(production ? [] : [{ email: "mod@digiads.vn", name: "Mod DigiAds", platformRole: "MOD" as const }]),
  ];
  for (const s of staff) {
    const existing = await prisma.user.findUnique({ where: { email: s.email } });
    if (existing?.passwordHash) {
      if (existing.platformRole !== s.platformRole) await prisma.user.update({ where: { id: existing.id }, data: { platformRole: s.platformRole } });
      console.log(`  ${s.email} exists (${s.platformRole}) — password unchanged`);
      continue;
    }
    await prisma.user.upsert({
      where: { email: s.email },
      update: { platformRole: s.platformRole, passwordHash: hash(password), status: "ACTIVE" },
      create: { ...s, passwordHash: hash(password), status: "ACTIVE" },
    });
    console.log(`  ${s.email} (${s.platformRole})${production ? "" : ` — mật khẩu: ${password}`}`);
  }
  console.log("Seeded DigiAds platform accounts");
}

main().finally(() => prisma.$disconnect());
