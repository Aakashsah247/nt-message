import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const namespaces = [
  "workspace",
  "settings",
  "common",
  "auth",
  "messaging",
  "admin",
  "directory",
  "requests",
  "teams",
  "positions",
  "organization",
  "monitoring",
  "analytics",
  "officialProfile",
];

async function readCatalog(language, namespace) {
  const url = new URL(
    `../src/i18n/locales/${language}/${namespace}.json`,
    import.meta.url,
  );
  return JSON.parse(await readFile(url, "utf8"));
}

function flattenKeys(value, prefix = "") {
  const keys = [];

  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      keys.push(...flattenKeys(child, path));
    } else {
      keys.push(path);
    }
  }

  return keys;
}

function assertNoBlankStrings(value, language, prefix = "") {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      assertNoBlankStrings(child, language, path);
      continue;
    }

    assert.equal(
      typeof child,
      "string",
      `${language}:${path} must be a string`,
    );
    assert.notEqual(
      child.trim(),
      "",
      `${language}:${path} must not be blank`,
    );
  }
}

test("English and Nepali i18n catalogs keep the same key structure", async () => {
  for (const namespace of namespaces) {
    const [english, nepali] = await Promise.all([
      readCatalog("en", namespace),
      readCatalog("ne", namespace),
    ]);

    assert.deepEqual(
      flattenKeys(nepali).sort(),
      flattenKeys(english).sort(),
      `Catalog keys differ for namespace: ${namespace}`,
    );

    assertNoBlankStrings(english, `en:${namespace}`);
    assertNoBlankStrings(nepali, `ne:${namespace}`);
  }
});
