import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // backend/ y frontend/ son el código anterior a la migración: se borran en
    // la fase 4 y no vale la pena adaptarlos al linter.
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
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
  prettier,
);
