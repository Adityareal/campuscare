import { MongoMemoryReplSet } from "mongodb-memory-server";

/**
 * Starts one in-memory MongoDB replica set for the whole run (transactions need a replica set)
 * and stops it afterwards. Each test file creates its own database inside it. Nothing persists.
 */
export default async function setup(): Promise<() => Promise<void>> {
  process.env.MONGOMS_VERSION ??= "8.0.4";
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  process.env.TEST_MONGO_URI = replSet.getUri();
  return async () => {
    await replSet.stop();
  };
}
