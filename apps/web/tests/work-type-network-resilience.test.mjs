import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const serviceUrl = new URL(
  "../src/services/work-type-v3.service.ts",
  import.meta.url,
);

function section(source, start, end) {
  const startIndex = source.indexOf(`export function ${start}`);
  assert.notEqual(startIndex, -1, `${start} should exist`);
  const endIndex = end ? source.indexOf(`export function ${end}`, startIndex) : source.length;
  return source.slice(startIndex, endIndex === -1 ? source.length : endIndex);
}

test("Work Type safe reads and idempotent saves retry one interrupted request", async () => {
  const source = await readFile(serviceUrl, "utf8");

  assert.match(source, /import \{ apiRequest, isApiNetworkError \} from "\.\.\/lib\/api"/);
  assert.match(source, /async function retryOnceOnNetworkError/);
  assert.match(source, /setTimeout\(resolve, 400\)/);

  for (const [name, next] of [
    ["getWorkTypeActions", "getWorkTypeConfigurationContext"],
    ["getWorkTypeConfigurationContext", "listWorkTypes"],
    ["listWorkTypes", "getWorkType"],
    ["getWorkType", "createWorkTypeDraft"],
    ["updateWorkTypeDraft", "replaceWorkTypeDraftConfiguration"],
    ["replaceWorkTypeDraftConfiguration", "discardWorkTypeDraft"],
  ]) {
    assert.match(section(source, name, next), /retryOnceOnNetworkError/);
  }
});

test("Work Type non-idempotent create and publish actions are not automatically retried", async () => {
  const source = await readFile(serviceUrl, "utf8");

  assert.doesNotMatch(
    section(source, "createWorkTypeDraft", "updateWorkTypeDraft"),
    /retryOnceOnNetworkError/,
  );
  assert.doesNotMatch(
    section(source, "publishWorkTypeDraft", "createWorkTypeDefinition"),
    /retryOnceOnNetworkError/,
  );
});
