import { createRequire } from "node:module";
import type { PrismaClient as PrismaClientType } from "@prisma/client";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client") as {
  PrismaClient: typeof import("@prisma/client").PrismaClient;
};

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClientType };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
