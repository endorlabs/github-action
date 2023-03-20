// @ts-check
const { defineConfig } = require("eslint-define-config");

module.exports = defineConfig({
  plugins: ["@typescript-eslint", "jest"],
  extends: ["plugin:github/recommended", "plugin:github/typescript"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    // Allow parsing of modern ECMAScript features
    ecmaVersion: 2021,
    // Using specific tsconfig to cover ts files for both tests and source
    project: "./tsconfig.eslint.json",
    // Allow use of `import`
    sourceType: "module",
  },
  rules: {
    // TODO: i18n for logging and output
    "i18n-text/no-en": "off",
    // Allows for `import * as ns from "node:pkg"`
    "import/no-namespace": "off",
  },
  overrides: [
    {
      files: ["jest.config.js", ".eslintrc.js"],
      rules: {
        "@typescript-eslint/no-var-requires": "off",
        "filenames/match-regex": "off",
        "import/no-commonjs": "off",
      },
    },
  ],
  env: {
    node: true,
    es6: true,
    "jest/globals": true,
  },
});
