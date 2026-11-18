/**
 * Rebuilds the CampusCare database from scratch: drops the database named in DATABASE_URL
 * (every collection), creates the indexes with `prisma db push`, then loads the demo data.
 *
 *   npm run db:reset -- --confirm <database name>
 *
 * DATABASE_URL is the live Atlas database, so this refuses to run unless --confirm matches the
 * database name in the URL. It prints the host and database name, never the credentials.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { createDbClient, databaseUrl } from "../src/lib/db";
import { assertDemoDeployment } from "../src/lib/demo";

/** Host and database name of a mongodb:// or mongodb+srv:// URL, without credentials. */
function describeTarget(url: string): { host: string; database: string } {
  const m = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)\/([^?]*)/.exec(url);
  if (!m?.[1] || !m[2]) throw new Error("DATABASE_URL must be a MongoDB URL that names a database, e.g. mongodb+srv://user:pass@host/campuscare.");
  return { host: m[1], database: decodeURIComponent(m[2]) };
}

async function main(): Promise<void> {
  assertDemoDeployment("reset the database");
  const url = databaseUrl();
  const { host, database } = describeTarget(url);
  const flag = process.argv.indexOf("--confirm");
  const confirmed = flag !== -1 ? process.argv[flag + 1] : undefined;
  console.log(`[db:reset] target: host ${host}, database ${database}`);
  if (confirmed !== database) {
    throw new Error(`Refusing to reset. This drops every collection in "${database}". Re-run with: npm run db:reset -- --confirm ${database}`);
  }

  const client = createDbClient(url);
  try {
    await client.$runCommandRaw({ dropDatabase: 1 });
  } finally {
    await client.$disconnect();
  }
  console.log("[db:reset] dropped all collections.");

  const prismaCli = path.resolve(process.cwd(), "node_modules", "prisma", "build", "index.js");
  execFileSync(process.execPath, [prismaCli, "db", "push", "--skip-generate", "--accept-data-loss"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });

  const { seed } = (await import("../prisma/seed")) as { seed: () => Promise<void> };
  const { closeDb } = await import("../src/lib/db");
  try {
    await seed();
    console.log("[db:reset] demo data loaded.");
  } finally {
    await closeDb();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(`[db:reset] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
