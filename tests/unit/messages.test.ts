import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import ru from "../../messages/ru.json";
import uz from "../../messages/uz.json";

/*
 * Labels the code asks for must exist in the message files. A label that is
 * missing does not fail the build: the page shows the raw key instead
 * ("groups.materials.watched"), which reached the live site twice. This test
 * reads every `useTranslations("…")` / `getTranslations("…")` in src and checks
 * each literal key used through it; keys built at run time are not covered.
 */

type Tree = { [key: string]: Tree | string };

function lookup(tree: Tree, dotted: string): Tree | string | undefined {
  let current: Tree | string | undefined = tree;
  for (const part of dotted.split(".")) {
    if (typeof current !== "object" || !(part in current)) return undefined;
    current = current[part];
  }
  return current;
}

function leaves(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" ? [prefix + key] : leaves(value, `${prefix}${key}.`),
  );
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const DECLARATION =
  /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(([^)]*)\)/g;

/** Literal keys used through a translator whose namespace is a literal, per file. */
function missingKeys(): string[] {
  const root = path.resolve(import.meta.dirname, "../../src");
  const missing: string[] = [];
  for (const file of sourceFiles(root)) {
    const source = readFileSync(file, "utf8");
    const namespaces = new Map<string, Set<string>>();
    const dynamic = new Set<string>();
    for (const match of source.matchAll(DECLARATION)) {
      const name = match[1]!;
      const argument = match[2]!.trim();
      const literal =
        /^["']([\w.]+)["']$/.exec(argument) ?? /namespace:\s*["']([\w.]+)["']/.exec(argument);
      if (argument === "") namespaces.set(name, (namespaces.get(name) ?? new Set()).add(""));
      else if (literal) namespaces.set(name, (namespaces.get(name) ?? new Set()).add(literal[1]!));
      else dynamic.add(name);
    }
    for (const [name, spaces] of namespaces) {
      // The same name with a namespace built at run time elsewhere in the file: cannot tell.
      if (dynamic.has(name)) continue;
      const use = new RegExp(
        `(?<![\\w.])${name}(?:\\.rich|\\.markup|\\.raw)?\\(\\s*["']([\\w.-]+)["']`,
        "g",
      );
      for (const match of source.matchAll(use)) {
        const key = match[1]!;
        const found = [...spaces].some(
          (space) => lookup(en as Tree, space ? `${space}.${key}` : key) !== undefined,
        );
        if (!found) {
          const line = source.slice(0, match.index).split("\n").length;
          missing.push(`${path.relative(root, file)}:${line} ${[...spaces].join("|")} → ${key}`);
        }
      }
    }
  }
  return missing;
}

describe("message files", () => {
  it("have the same keys in English, Uzbek and Russian", () => {
    const english = leaves(en as Tree).sort();
    expect(leaves(uz as Tree).sort()).toEqual(english);
    expect(leaves(ru as Tree).sort()).toEqual(english);
  });

  it("hold every label the code asks for by a literal key", () => {
    expect(missingKeys()).toEqual([]);
  });
});
