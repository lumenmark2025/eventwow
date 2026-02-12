import fs from "fs";
import path from "path";

const cwd = process.cwd();
const vercelConfigPath = path.join(cwd, "vercel.json");
const apiRoot = path.join(cwd, "api");

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function listFilesRecursive(dir) {
  const out = [];
  const stack = [dir];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }

  return out;
}

function globToRegex(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "___DOUBLE_WILDCARD___")
    .replace(/\*/g, "[^/]*")
    .replace(/___DOUBLE_WILDCARD___/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function hasWildcard(src) {
  return src.includes("*");
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

if (!fs.existsSync(apiRoot) || !fs.statSync(apiRoot).isDirectory()) {
  console.error("ERROR: Missing api/ directory at repo root.");
  console.error("Your Vercel API root does not match expected structure: ./api");
  process.exit(1);
}

const hasVercelJson = fs.existsSync(vercelConfigPath);
let vercel = null;
if (hasVercelJson) {
  try {
    vercel = readJson(vercelConfigPath);
  } catch (err) {
    console.error(`ERROR: Failed to parse vercel.json: ${err.message}`);
    process.exit(1);
  }
}

const apiFilesAbs = listFilesRecursive(apiRoot).sort();
const apiFilesRel = apiFilesAbs.map((f) => toPosix(path.relative(cwd, f)));
const apiFilesSet = new Set(apiFilesRel);

console.log("=== Vercel Config Check ===");
console.log(`Repo: ${cwd}`);
console.log(`vercel.json: ${hasVercelJson ? vercelConfigPath : "(not found)"}`);
console.log("");

console.log("API files found:");
if (apiFilesRel.length === 0) {
  console.log("  (none)");
} else {
  for (const file of apiFilesRel) {
    console.log(`  - ${file}`);
  }
}
console.log("");

if (!hasVercelJson) {
  console.log("No custom builds configured.");
  process.exit(0);
}

const builds = Array.isArray(vercel.builds) ? vercel.builds : null;
if (!builds) {
  console.log("No custom builds configured.");
  process.exit(0);
}

console.log("Build entries:");
const missing = [];

for (const build of builds) {
  const srcRaw = build && typeof build.src === "string" ? build.src : "";
  const src = toPosix(srcRaw);

  if (!src) {
    console.log("  - src: (missing) -> INVALID (no src field)");
    missing.push("(missing src)");
    continue;
  }

  let exists = false;
  if (hasWildcard(src)) {
    const re = globToRegex(src);
    exists = apiFilesRel.some((f) => re.test(f));
  } else {
    exists = apiFilesSet.has(src);
  }

  console.log(`  - src: ${src}`);
  console.log(`    exists: ${exists ? "YES" : "NO"}`);

  if (!exists) {
    missing.push(src);
  }
}

console.log("");
if (missing.length > 0) {
  console.log("Missing build paths:");
  for (const src of missing) {
    console.log(`  - ${src}`);
  }
  process.exitCode = 1;
} else {
  console.log("All build paths resolve to existing api files.");
}
