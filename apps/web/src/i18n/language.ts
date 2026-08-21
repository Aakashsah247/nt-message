git pull --ff-only origin mainexport const SUPPORTED_INTERFACE_LANGUAGES = ["en", "ne"] as const;

export type InterfaceLanguage =
  (typeof SUPPORTED_INTERFACE_LANGUAGES)[number];

export const DEFAULT_INTERFACE_LANGUAGE: InterfaceLanguage = "en";

export function normalizeInterfaceLanguage(
  value: unknown,
): InterfaceLanguage {
  return value === "ne" ? "ne" : DEFAULT_INTERFACE_LANGUAGE;
}
