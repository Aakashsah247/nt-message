import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";

const MESSAGE_APP_RUNTIME_MODULES = [
  "../src/pages/MessageAppPage.tsx",
  "../src/pages/useMessageAppController.tsx",
  "../src/pages/MessageAppFoundation.tsx",
  "../src/pages/message-app-foundation.ts",
];

export function readMessageAppRuntimeSourceSync() {
  return MESSAGE_APP_RUNTIME_MODULES.map((relativePath) =>
    readFileSync(new URL(relativePath, import.meta.url), "utf8"),
  ).join("\n");
}

export async function readMessageAppRuntimeSource() {
  const sources = await Promise.all(
    MESSAGE_APP_RUNTIME_MODULES.map((relativePath) =>
      readFile(new URL(relativePath, import.meta.url), "utf8"),
    ),
  );

  return sources.join("\n");
}
