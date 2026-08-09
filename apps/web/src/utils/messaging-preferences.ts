export type MessagingTheme = "NT_BLUE" | "SYSTEM" | "LIGHT" | "DARK";
export type ResolvedMessagingTheme = Exclude<MessagingTheme, "SYSTEM">;
export type MessagingWallpaper = "CLEAN" | "DOTS" | "WAVES" | "GRID";
export type MessagingDensity = "COMFORTABLE" | "COMPACT";

export interface MessagingCustomization {
  theme: MessagingTheme;
  wallpaper: MessagingWallpaper;
  density: MessagingDensity;
  reduceMotion: boolean;
}

export interface MessagingDeviceSettings {
  notificationPreview: boolean;
  muteAllNotifications: boolean;
}

export type ActiveUtilityPanel =
  | { kind: "PROFILE"; accountId: string }
  | { kind: "SETTINGS" }
  | { kind: "NOTIFICATIONS" }
  | null;

export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const CUSTOMIZATION_STORAGE_KEY = "nt-message:customization";
export const SETTINGS_STORAGE_KEY = "nt-message:settings";
export const NOTIFICATION_SOUND_STORAGE_KEY =
  "nt-message:notification-sound-enabled";
export const BROWSER_NOTIFICATION_STORAGE_KEY =
  "nt-message:browser-notifications-enabled";

export const DEFAULT_MESSAGING_CUSTOMIZATION: MessagingCustomization = {
  theme: "NT_BLUE",
  wallpaper: "CLEAN",
  density: "COMFORTABLE",
  reduceMotion: false,
};

export const DEFAULT_MESSAGING_DEVICE_SETTINGS: MessagingDeviceSettings = {
  notificationPreview: true,
  muteAllNotifications: false,
};

export const THEME_OPTIONS: Array<{
  value: MessagingTheme;
  label: string;
}> = [
  { value: "NT_BLUE", label: "NT Blue" },
  { value: "SYSTEM", label: "System" },
  { value: "LIGHT", label: "Light" },
  { value: "DARK", label: "Dark" },
];

export const WALLPAPER_OPTIONS: Array<{
  value: MessagingWallpaper;
  label: string;
}> = [
  { value: "CLEAN", label: "Clean" },
  { value: "DOTS", label: "Dots" },
  { value: "WAVES", label: "Waves" },
  { value: "GRID", label: "Grid" },
];

export const DENSITY_OPTIONS: Array<{
  value: MessagingDensity;
  label: string;
}> = [
  { value: "COMFORTABLE", label: "Comfortable" },
  { value: "COMPACT", label: "Compact" },
];

export function scopedMessagingStorageKey(
  baseKey: string,
  accountId: string | null | undefined,
): string | null {
  const normalizedAccountId = accountId?.trim();
  return normalizedAccountId ? `${baseKey}:${normalizedAccountId}` : null;
}

function isMessagingTheme(value: unknown): value is MessagingTheme {
  return (
    value === "NT_BLUE" ||
    value === "SYSTEM" ||
    value === "LIGHT" ||
    value === "DARK"
  );
}

function isMessagingWallpaper(value: unknown): value is MessagingWallpaper {
  return (
    value === "CLEAN" ||
    value === "DOTS" ||
    value === "WAVES" ||
    value === "GRID"
  );
}

function isMessagingDensity(value: unknown): value is MessagingDensity {
  return value === "COMFORTABLE" || value === "COMPACT";
}

function readScopedJson(
  storage: PreferenceStorage,
  baseKey: string,
  accountId: string | null | undefined,
): unknown {
  const storageKey = scopedMessagingStorageKey(baseKey, accountId);

  if (!storageKey) {
    return null;
  }

  const stored = storage.getItem(storageKey);
  return stored ? JSON.parse(stored) : null;
}

export function readMessagingCustomization(
  storage: PreferenceStorage,
  accountId: string | null | undefined,
): MessagingCustomization {
  try {
    const parsed = readScopedJson(
      storage,
      CUSTOMIZATION_STORAGE_KEY,
      accountId,
    ) as Partial<MessagingCustomization> | null;

    if (!parsed) {
      return DEFAULT_MESSAGING_CUSTOMIZATION;
    }

    return {
      theme: isMessagingTheme(parsed.theme)
        ? parsed.theme
        : DEFAULT_MESSAGING_CUSTOMIZATION.theme,
      wallpaper: isMessagingWallpaper(parsed.wallpaper)
        ? parsed.wallpaper
        : DEFAULT_MESSAGING_CUSTOMIZATION.wallpaper,
      density: isMessagingDensity(parsed.density)
        ? parsed.density
        : DEFAULT_MESSAGING_CUSTOMIZATION.density,
      reduceMotion:
        typeof parsed.reduceMotion === "boolean"
          ? parsed.reduceMotion
          : DEFAULT_MESSAGING_CUSTOMIZATION.reduceMotion,
    };
  } catch {
    return DEFAULT_MESSAGING_CUSTOMIZATION;
  }
}

export function writeMessagingCustomization(
  storage: PreferenceStorage,
  accountId: string | null | undefined,
  customization: MessagingCustomization,
): void {
  const storageKey = scopedMessagingStorageKey(
    CUSTOMIZATION_STORAGE_KEY,
    accountId,
  );

  if (storageKey) {
    storage.setItem(storageKey, JSON.stringify(customization));
  }
}

export function readMessagingDeviceSettings(
  storage: PreferenceStorage,
  accountId: string | null | undefined,
): MessagingDeviceSettings {
  try {
    const parsed = readScopedJson(
      storage,
      SETTINGS_STORAGE_KEY,
      accountId,
    ) as Partial<MessagingDeviceSettings> | null;

    if (!parsed) {
      return DEFAULT_MESSAGING_DEVICE_SETTINGS;
    }

    return {
      notificationPreview:
        typeof parsed.notificationPreview === "boolean"
          ? parsed.notificationPreview
          : DEFAULT_MESSAGING_DEVICE_SETTINGS.notificationPreview,
      muteAllNotifications:
        typeof parsed.muteAllNotifications === "boolean"
          ? parsed.muteAllNotifications
          : DEFAULT_MESSAGING_DEVICE_SETTINGS.muteAllNotifications,
    };
  } catch {
    return DEFAULT_MESSAGING_DEVICE_SETTINGS;
  }
}

export function writeMessagingDeviceSettings(
  storage: PreferenceStorage,
  accountId: string | null | undefined,
  settings: MessagingDeviceSettings,
): void {
  const storageKey = scopedMessagingStorageKey(SETTINGS_STORAGE_KEY, accountId);

  if (storageKey) {
    storage.setItem(storageKey, JSON.stringify(settings));
  }
}

export function readMessagingBooleanPreference(
  storage: PreferenceStorage,
  baseKey: string,
  accountId: string | null | undefined,
  defaultValue: boolean,
): boolean {
  const storageKey = scopedMessagingStorageKey(baseKey, accountId);

  if (!storageKey) {
    return defaultValue;
  }

  const stored = storage.getItem(storageKey);
  return stored === null ? defaultValue : stored === "true";
}

export function writeMessagingBooleanPreference(
  storage: PreferenceStorage,
  baseKey: string,
  accountId: string | null | undefined,
  value: boolean,
): void {
  const storageKey = scopedMessagingStorageKey(baseKey, accountId);

  if (storageKey) {
    storage.setItem(storageKey, value ? "true" : "false");
  }
}

export function resolveMessagingTheme(
  theme: MessagingTheme,
  systemPrefersDark: boolean,
): ResolvedMessagingTheme {
  if (theme === "SYSTEM") {
    return systemPrefersDark ? "DARK" : "LIGHT";
  }

  return theme;
}

export function toggleUtilityPanel(
  current: ActiveUtilityPanel,
  next: Exclude<ActiveUtilityPanel, null>,
): ActiveUtilityPanel {
  if (current?.kind !== next.kind) {
    return next;
  }

  if (next.kind === "PROFILE") {
    return current.kind === "PROFILE" && current.accountId === next.accountId
      ? null
      : next;
  }

  return null;
}
