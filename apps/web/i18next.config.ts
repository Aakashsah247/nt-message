import { defineConfig } from "i18next-cli";

export default defineConfig({
  locales: ["en", "ne"],
  extract: {
    input: ["src/**/*.{ts,tsx}"],
    output: "src/i18n/locales/{{language}}/{{namespace}}.json",
    primaryLanguage: "en",
    defaultNS: "workspace",
    defaultValue: "",
    removeUnusedKeys: false,
    sort: true,
    extractFromComments: false,
  },
  types: {
    input: ["src/i18n/locales/en/*.json"],
    basePath: "src/i18n/locales/en",
    output: "src/types/i18next.d.ts",
    resourcesFile: "src/types/i18next-resources.d.ts",
  },
});
