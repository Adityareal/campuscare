import "@/test/env";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoModeEnabled } from "@/lib/auth/session";
import { assertDemoDeployment, resetDeploymentWarningForTests } from "@/lib/demo";

const env = process.env as Record<string, string | undefined>;
let savedDeployment: string | undefined;
let savedLegacy: string | undefined;

beforeEach(() => {
  savedDeployment = env.CAMPUSCARE_DEPLOYMENT;
  savedLegacy = env.DEMO_MODE;
  delete env.CAMPUSCARE_DEPLOYMENT;
  delete env.DEMO_MODE;
  resetDeploymentWarningForTests();
});
afterEach(() => {
  if (savedDeployment === undefined) delete env.CAMPUSCARE_DEPLOYMENT;
  else env.CAMPUSCARE_DEPLOYMENT = savedDeployment;
  if (savedLegacy === undefined) delete env.DEMO_MODE;
  else env.DEMO_MODE = savedLegacy;
  vi.restoreAllMocks();
});

describe("demoModeEnabled", () => {
  it.each([
    [undefined, false],
    ["", false],
    ["demo", true],
    ["pilot", false],
    ["production", false],
    ["Demo", false],
    ["junk", false],
  ])("CAMPUSCARE_DEPLOYMENT=%s gives %s", (value, expected) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    if (value !== undefined) env.CAMPUSCARE_DEPLOYMENT = value;
    expect(demoModeEnabled()).toBe(expected);
  });

  it("ignores the old DEMO_MODE setting", () => {
    env.DEMO_MODE = "true";
    expect(demoModeEnabled()).toBe(false);
  });

  it("logs an unrecognised value once per process, and nothing for the known values", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const ok of ["demo", "pilot", "production", "", undefined]) {
      if (ok === undefined) delete env.CAMPUSCARE_DEPLOYMENT;
      else env.CAMPUSCARE_DEPLOYMENT = ok;
      demoModeEnabled();
    }
    expect(spy).not.toHaveBeenCalled();
    env.CAMPUSCARE_DEPLOYMENT = "junk";
    demoModeEnabled();
    demoModeEnabled();
    demoModeEnabled();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("assertDemoDeployment", () => {
  it("throws unless the value is demo", () => {
    expect(() => assertDemoDeployment("seed")).toThrow(/CAMPUSCARE_DEPLOYMENT=demo/);
    env.CAMPUSCARE_DEPLOYMENT = "pilot";
    expect(() => assertDemoDeployment("seed")).toThrow();
    env.CAMPUSCARE_DEPLOYMENT = "demo";
    expect(() => assertDemoDeployment("seed")).not.toThrow();
  });
});
