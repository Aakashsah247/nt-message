import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const loginUrl = new URL("../src/pages/LoginPage.tsx", import.meta.url);
const cssUrl = new URL("../src/index.css", import.meta.url);

test("login password visibility control uses icons instead of floating text", async () => {
  const login = await readFile(loginUrl, "utf8");

  assert.match(login, /className="password-toggle-icon"/);
  assert.match(login, /<circle cx="12" cy="12" r="3" \/>/);
  assert.match(login, /<path d="M3 3l18 18" \/>/);
  assert.doesNotMatch(login, /t\("actions\.show",/);
  assert.doesNotMatch(login, /t\("actions\.hide",/);
  assert.match(login, /t\("actions\.showPassword", \{ ns: "common" \}\)/);
  assert.match(login, /t\("actions\.hidePassword", \{ ns: "common" \}\)/);
  assert.match(login, /aria-pressed=\{showPassword\}/);
});

test("login password visibility control stays fixed on hover and press", async () => {
  const css = await readFile(cssUrl, "utf8");
  const toggleBlock = css.match(/\.password-toggle \{[\s\S]*?\n  \}/)?.[0] ?? "";
  const interactionBlock =
    css.match(
      /\.password-toggle:hover,\s*\n  \.password-toggle:active \{[\s\S]*?\n  \}/,
    )?.[0] ?? "";

  assert.match(toggleBlock, /bottom-0 right-2 top-0 my-auto/);
  assert.match(toggleBlock, /h-10 w-10/);
  assert.doesNotMatch(toggleBlock, /transform/);
  assert.doesNotMatch(toggleBlock, /transition:[\s\S]*?transform/);
  assert.doesNotMatch(interactionBlock, /transform|scale\(/);
});
