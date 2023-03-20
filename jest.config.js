/** @type {import('jest').Config} */
const config = {
  clearMocks: true,
  moduleFileExtensions: ["js", "ts"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  verbose: false,
  reporters: [
    // Annotate test output for GitHub
    ["github-actions", { silent: false }],
    "summary",
  ],
};

module.exports = config;
