import { execFileSync } from "node:child_process";

// The presentation migrations froze backend bytes. This focused performance pass
// changes only scheduling in these three public GET handlers; compare their real
// query shapes, responses, publication gates and failures to the frozen baseline.
// All other API/auth/token/RLS files retain the historical byte-for-byte check.
export const performanceApiExclusions = [
  ":(exclude)api/public-suppliers.js",
  ":(exclude)api/public-supplier.js",
  ":(exclude)api/public-venue.js",
];

export function verifyPerformanceApiContracts() {
  execFileSync(process.execPath, ["scripts/verify-performance-api.mjs"], {
    stdio: "pipe",
    env: { ...process.env, PERFORMANCE_BASELINE: "", PERFORMANCE_REPORT: "" },
  });
}
