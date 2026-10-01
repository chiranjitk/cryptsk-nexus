import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const existing = await db.user.findUnique({ where: { email: "admin@cryptsk.com" } });
  if (existing) {
    console.log("Admin already exists");
    await db.$disconnect();
    return;
  }

  const pw = await hash("Admin@2026", 12);
  await db.user.create({
    data: {
      id: "usr_admin_001",
      email: "admin@cryptsk.com",
      name: "Super Administrator",
      password: pw,
      phone: "9000000001",
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      avatarUrl: "",
      twoFactorEnabled: false,
      updatedAt: new Date(),
    },
  });
  console.log("Admin user created: admin@cryptsk.com / Admin@2026");
  await db.$disconnect();
}

main().catch(console.error);
