import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parse } from "@babel/parser";
export function cleanAst(value) {
  if (Array.isArray(value)) return value.map(cleanAst);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([k]) =>
          ![
            "loc",
            "start",
            "end",
            "extra",
            "leadingComments",
            "trailingComments",
            "innerComments",
          ].includes(k),
      )
      .map(([k, v]) => [k, cleanAst(v)]),
  );
}
export function assertAppContract(baseline) {
  const extract = (source) =>
    cleanAst(
      parse(source, {
        sourceType: "module",
        plugins: ["jsx"],
      }).program.body.filter(
        (n) =>
          !(
            n.type === "FunctionDeclaration" &&
            ["AccessDenied", "LoadingAccess"].includes(n.id.name)
          ) &&
          !(
            n.type === "ImportDeclaration" &&
            ["./components/auth/AuthShell", "./components/ui/Button"].includes(
              n.source.value,
            )
          ),
      ),
    );
  assert.deepEqual(
    extract(readFileSync("src/App.jsx", "utf8")),
    extract(
      execFileSync("git", ["show", `${baseline}:src/App.jsx`], {
        encoding: "utf8",
      }),
    ),
    "App routes, session lifecycle, normalization and all role guards unchanged",
  );
}
