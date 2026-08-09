import assert from "node:assert/strict";
import test from "node:test";

import {
  BROWSER_NOTIFICATION_STORAGE_KEY,
  CUSTOMIZATION_STORAGE_KEY,
  DEFAULT_MESSAGING_CUSTOMIZATION,
  NOTIFICATION_SOUND_STORAGE_KEY,
  readMessagingBooleanPreference,
  readMessagingCustomization,
  readMessagingDeviceSettings,
  resolveMessagingTheme,
  scopedMessagingStorageKey,
  toggleUtilityPanel,
  writeMessagingBooleanPreference,
  writeMessagingCustomization,
  writeMessagingDeviceSettings,
} from "../src/utils/messaging-preferences.ts";

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }
}

test("preference storage keys are isolated by account", () => {
  assert.equal(
    scopedMessagingStorageKey(CUSTOMIZATION_STORAGE_KEY, "account-a"),
    "nt-message:customization:account-a",
  );
  assert.notEqual(
    scopedMessagingStorageKey(CUSTOMIZATION_STORAGE_KEY, "account-a"),
    scopedMessagingStorageKey(CUSTOMIZATION_STORAGE_KEY, "account-b"),
  );
  assert.equal(scopedMessagingStorageKey(CUSTOMIZATION_STORAGE_KEY, null), null);
});

test("customization does not leak between accounts", () => {
  const storage = new MemoryStorage();

  writeMessagingCustomization(storage, "account-a", {
    theme: "SYSTEM",
    wallpaper: "WAVES",
    density: "COMPACT",
    reduceMotion: true,
  });

  assert.deepEqual(readMessagingCustomization(storage, "account-a"), {
    theme: "SYSTEM",
    wallpaper: "WAVES",
    density: "COMPACT",
    reduceMotion: true,
  });
  assert.deepEqual(
    readMessagingCustomization(storage, "account-b"),
    DEFAULT_MESSAGING_CUSTOMIZATION,
  );
});

test("invalid customization values fall back safely", () => {
  const storage = new MemoryStorage();
  storage.setItem(
    scopedMessagingStorageKey(CUSTOMIZATION_STORAGE_KEY, "account-a"),
    JSON.stringify({
      theme: "UNKNOWN",
      wallpaper: "NOISE",
      density: "TINY",
      reduceMotion: "yes",
      accent: "ROSE",
    }),
  );

  assert.deepEqual(
    readMessagingCustomization(storage, "account-a"),
    DEFAULT_MESSAGING_CUSTOMIZATION,
  );
});

test("device notification settings are account scoped", () => {
  const storage = new MemoryStorage();
  writeMessagingDeviceSettings(storage, "account-a", {
    notificationPreview: false,
    muteAllNotifications: true,
  });

  assert.deepEqual(readMessagingDeviceSettings(storage, "account-a"), {
    notificationPreview: false,
    muteAllNotifications: true,
  });
  assert.deepEqual(readMessagingDeviceSettings(storage, "account-b"), {
    notificationPreview: true,
    muteAllNotifications: false,
  });
});

test("sound and browser notification preferences are account scoped", () => {
  const storage = new MemoryStorage();

  writeMessagingBooleanPreference(
    storage,
    NOTIFICATION_SOUND_STORAGE_KEY,
    "account-a",
    false,
  );
  writeMessagingBooleanPreference(
    storage,
    BROWSER_NOTIFICATION_STORAGE_KEY,
    "account-a",
    true,
  );

  assert.equal(
    readMessagingBooleanPreference(
      storage,
      NOTIFICATION_SOUND_STORAGE_KEY,
      "account-a",
      true,
    ),
    false,
  );
  assert.equal(
    readMessagingBooleanPreference(
      storage,
      BROWSER_NOTIFICATION_STORAGE_KEY,
      "account-b",
      false,
    ),
    false,
  );
});

test("System theme follows the operating-system preference", () => {
  assert.equal(resolveMessagingTheme("SYSTEM", true), "DARK");
  assert.equal(resolveMessagingTheme("SYSTEM", false), "LIGHT");
  assert.equal(resolveMessagingTheme("NT_BLUE", true), "NT_BLUE");
});

test("opening a utility panel replaces the previous panel", () => {
  const profile = { kind: "PROFILE", accountId: "account-a" };
  const settings = { kind: "SETTINGS" };
  const notifications = { kind: "NOTIFICATIONS" };

  assert.deepEqual(toggleUtilityPanel(null, settings), settings);
  assert.deepEqual(toggleUtilityPanel(settings, notifications), notifications);
  assert.deepEqual(toggleUtilityPanel(notifications, profile), profile);
  assert.equal(toggleUtilityPanel(profile, profile), null);
  assert.deepEqual(
    toggleUtilityPanel(profile, { kind: "PROFILE", accountId: "account-b" }),
    { kind: "PROFILE", accountId: "account-b" },
  );
});
