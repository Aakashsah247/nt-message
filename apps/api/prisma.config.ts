import { config } from "dotenv";
import { resolve } from "node:path";
import { defineConfig, env } from "prisma/config";

/*
 * Our main .env file is stored at the monorepo root:
 *
 * nt-message/.env
 *
 * Prisma commands run inside apps/api, so ../../.env points
 * back to the root environment file.
 */
config({
  path: resolve(process.cwd(), "../../.env"),
});

export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },

  datasource: {
    url: env("DATABASE_URL"),
  },
});
