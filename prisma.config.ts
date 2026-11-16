import "dotenv/config";
import { defineConfig } from "prisma/config";

// Local development runs on PGlite (in-process Postgres), which Prisma Migrate cannot
// connect to. Local migrations are applied by scripts/db-reset.ts instead. A datasource
// is only configured when DATABASE_URL points at a real Postgres server (pilot / prod),
// where `npm run db:deploy` applies the same SQL files under prisma/migrations.
const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  ...(url && url.startsWith("postgres") ? { datasource: { url } } : {}),
});
