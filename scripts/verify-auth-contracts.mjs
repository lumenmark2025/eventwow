import {
  performanceApiExclusions,
  verifyPerformanceApiContracts,
} from "./fixtures/performance-contracts.mjs";
import { assertAppContract } from "./fixtures/assert-app-contract.mjs";
/* global console */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parse } from "@babel/parser";
const baseline = "cacddc95c59d7ec6c7adec20c9d9e3f22240551a";
const files = [
  "src/components/Login.jsx",
  "src/pages/AuthCallbackPage.jsx",
  "src/pages/ForgotPassword.jsx",
  "src/pages/ResetPassword.jsx",
  "src/pages/UpdatePassword.jsx",
  "src/pages/marketing/SupplierJoinPage.jsx",
  "src/pages/marketing/SupplierOnboardingPage.jsx",
  "src/pages/marketing/SupplierVerifyPage.jsx",
  "src/pages/marketing/VenueClaimRequestPage.jsx",
  "src/pages/marketing/VenueClaimVerifyPage.jsx",
];
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) =>
          ![
            "loc",
            "start",
            "end",
            "extra",
            "leadingComments",
            "trailingComments",
            "innerComments",
          ].includes(key),
      )
      .map(([key, val]) => [key, clean(val)]),
  );
}
function hasJsx(value) {
  if (!value || typeof value !== "object") return false;
  if (value.type?.startsWith("JSX")) return true;
  return Object.values(value).some((v) =>
    Array.isArray(v) ? v.some(hasJsx) : hasJsx(v),
  );
}
function contracts(source) {
  const ast = parse(source, { sourceType: "module", plugins: ["jsx"] });
  const statements = ast.program.body
    .filter((n) => n.type !== "ImportDeclaration")
    .flatMap((n) =>
      n.type === "ExportDefaultDeclaration"
        ? n.declaration.body.body.filter((n) => !hasJsx(n))
        : [n],
    );
  const fields = [];
  function visit(n) {
    if (!n || typeof n !== "object") return;
    if (
      n.type === "JSXAttribute" &&
      [
        "onClick",
        "onChange",
        "onFocus",
        "onSubmit",
        "disabled",
        "required",
        "min",
        "max",
        "maxLength",
        "minLength",
        "to",
        "href",
        "autoComplete",
        "step",
        "value",
        "checked",
        "type",
      ].includes(n.name.name)
    )
      fields.push(clean(n));
    Object.values(n).forEach((v) =>
      Array.isArray(v) ? v.forEach(visit) : visit(v),
    );
  }
  visit(ast);
  return { statements: clean(statements), fields };
}
for (const file of files) {
  const before = execFileSync("git", ["show", `${baseline}:${file}`], {
    encoding: "utf8",
  });
  assert.deepEqual(
    contracts(readFileSync(file, "utf8")),
    contracts(before),
    `${file}: workflow/validation contract changed`,
  );
  console.log(
    `PASS unchanged handlers, hooks, payloads, options and action conditions: ${file}`,
  );
}
assert.equal(
  execFileSync(
    "git",
    [
      "diff",
      baseline,
      "--",
      "api",
      "supabase",
      "src/lib",
      ...performanceApiExclusions,
    ],
    {
      encoding: "utf8",
    },
  ),
  "",
  "Backend, guards, routes and token contracts unchanged",
);
console.log(
  "PASS Private API, RLS, token, route and library source unchanged; public read scheduling verified separately",
);

assertAppContract(baseline);

verifyPerformanceApiContracts();
