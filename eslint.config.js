import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // backend/ y frontend/ son el código anterior a la migración: se borran en
    // la fase 4 y no vale la pena adaptarlos al linter.
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "playwright-report/**",
      ".claude/**",
      "backend/**",
      "frontend/**",
      "supabase/**",
      "playwright-report/**",
      "test-results/**",
      "packages/shared/src/database.types.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      eqeqeq: ["error", "always"],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
    },
  },
  {
    // La app corre en el navegador.
    files: ["apps/web/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["apps/web/public/sw.js"],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  prettier,
);
