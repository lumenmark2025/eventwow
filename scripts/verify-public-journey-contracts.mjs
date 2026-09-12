import { assertAppContract } from "./fixtures/assert-app-contract.mjs";
/* global console */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parse } from "@babel/parser";
const baseline = "1bd6257cbc09315f70647382a24c614049d38ff6";
const files = [
  "src/pages/marketing/RequestPage.jsx",
  "src/pages/marketing/SupplierRequestQuotePage.jsx",
  "src/pages/marketing/EnquiryQuotesPage.jsx",
  "src/pages/marketing/BookingAccessPage.jsx",
  "src/pages/PublicQuotePage.jsx",
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
  execFileSync("git", ["diff", baseline, "--", "api", "supabase", "src/lib"], {
    encoding: "utf8",
  }),
  "",
  "Backend, guards, routes and token contracts unchanged",
);
console.log("PASS API, RLS, token, route and library source unchanged");

assertAppContract(baseline);
