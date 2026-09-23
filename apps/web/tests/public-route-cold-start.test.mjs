import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicRouteUrl = new URL(
  "../src/components/PublicRoute.tsx",
  import.meta.url,
);
const protectedRouteUrl = new URL(
  "../src/components/ProtectedRoute.tsx",
  import.meta.url,
);
const authContextUrl = new URL(
  "../src/context/AuthContext.tsx",
  import.meta.url,
);

test("public auth pages do not block on background session recovery", async () => {
  const publicRoute = await readFile(publicRouteUrl, "utf8");

  assert.match(publicRoute, /const \{\s*account,?\s*\} = useAuth\(\)/);
  assert.doesNotMatch(publicRoute, /account,\s*loading,/);
  assert.doesNotMatch(publicRoute, /if \(loading\)/);
  assert.doesNotMatch(publicRoute, /className="loading"/);
  assert.match(publicRoute, /if \(account\)/);
  assert.match(publicRoute, /<Navigate[\s\S]*?to="\/"[\s\S]*?replace/);
  assert.match(publicRoute, /return children;/);
});

test("session recovery still runs in the background", async () => {
  const authContext = await readFile(authContextUrl, "utf8");

  assert.match(
    authContext,
    /useEffect\(\(\) => \{[\s\S]*?refreshAuth\(\)[\s\S]*?setLoading\(false\)/,
  );
});

test("protected pages still wait for authentication before rendering", async () => {
  const protectedRoute = await readFile(protectedRouteUrl, "utf8");

  assert.match(protectedRoute, /account,\s*loading,/);
  assert.match(protectedRoute, /if \(loading\)/);
  assert.match(protectedRoute, /if \(!account\)/);
  assert.match(protectedRoute, /to="\/login"/);
});
