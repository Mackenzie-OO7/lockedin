// eslint.config.js
import js from "@eslint/js";
import globals from "globals";

import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

import reactDOM from "eslint-plugin-react-dom";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import reactX from "eslint-plugin-react-x";

import prettier from "eslint-config-prettier";
import { globalIgnores } from "eslint/config";

export default [
  // 🔹 Global ignores
  globalIgnores([
    "dist",
    "packages",
    "src/contracts/*",
    "!src/contracts/util.ts",
  ]),

  // 🔹 Base JS rules
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...js.configs.recommended,
  },

  // 🔹 TypeScript + React rules
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      ecmaVersion: 2020,
      globals: globals.browser,
    },

    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-dom": reactDOM,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "react-x": reactX,
    },

    rules: {
      ...tsPlugin.configs["recommended-type-checked"].rules,
      ...reactDOM.configs.recommended.rules,
      ...reactHooks.configs["recommended-latest"].rules,
      ...reactRefresh.configs.vite.rules,
      ...reactX.configs["recommended-typescript"].rules,
      ...prettier.rules,

      // Custom rule example
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
];
