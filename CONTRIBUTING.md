# Contributing

Thank you for contributing!

We have prepared a short guide so that the process of making your contribution is as simple and clear as possible. Please check it out before you contribute.

<details open>
<summary>Table of Contents</summary>

- [Contributing](#contributing)
  - [Prerequisites for Local Development](#prerequisites-for-local-development)
  - [Development and Testing](#development-and-testing)
    - [Code Structure](#code-structure)
    - [Common tasks](#common-tasks)

</details>

## Prerequisites for Local Development

Before you start, ensure that you have the necessary dependencies for developing and building the action. Without the required dependencies, building or testing the action locally will fail.

- [node](https://nodejs.org/en): JavaScript runtime environment used for the GitHub action development
  - Recommended version ">=20"
  - Download and install from https://nodejs.org/en/download
  - Alternative: install and manage node versions with [`nvm`](https://github.com/nvm-sh/nvm)
- [yarn](https://yarnpkg.com):
  - Recommended version: "Classic Stable: v1.22.19"
  - Install and manage yarn through Corepack (requires node > "v16.9.x0")
    - `corepack enable yarn` ([Reference](https://github.com/nodejs/corepack#corepack-enable--name))
  - Alternative: install from [classic.yarnpkg.com](https://classic.yarnpkg.com/en/docs/install)
- (optional) [licensed](https://github.com/github/licensed): Used to check licenses of open source dependencies.
  - Installation guide at https://github.com/github/licensed

## Development and Testing

To develop the action locally, clone the repo and install the dependencies.

```sh
git clone https://github.com/endorlabs/github-action.git
cd github-action
yarn install
```

You're ready to start developing!

### Code Structure

The source code and supporting resources for the action are laid out with the following structure:

- `__tests__/`: Unit tests for the action logic and related test fixtures.
- `.github/`: CI workflows to run tests and other code quality checks for PRs.
- `.licenses/`: Cached OSS dependency licenses are stored here, and used by `licensed` to detect license changes.
- `dist/`: The packaged source code + dependency code for the action. Typically build output is not tracked in source code for JavaScript projects, but the action dependencies must be packaged with the source code as the action does not run an install step when executing.
- `src/`: The source code for the action.

### Common tasks

- `yarn run all`: This runs _all_ of the tasks below. It is recommended to run this command before committing changes.
- `yarn run build`: This transpile the TypeScript source code to JavaScript
- `yarn run format`: This formats source files with [Prettier](https://prettier.io), to ensure consistent formatting
  - `yarn run format:fix`: This applies recommended fixes for formatting issues from Prettier.
- `yarn run lint`: This lints the source code with [ESLint](https://eslint.org), to catch syntax errors and ensure code ensure a consistent code style
  - `yarn run format:fix`: This applies recommended fixes for linting issues from ESlint.
- `yarn run package`: This packages the action source code and dependency code together under `dist/`
- `yarn test`: This runs the unit test suites defined with [Jest](https://jestjs.io)

