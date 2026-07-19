# Contributing to Texpile

Thanks for your interest in contributing.

## Talk before you code

**Drive-by pull requests will not be accepted.** Before writing any code, discuss the change with the current maintainer:

- Open a [GitHub issue](../../issues) describing what you want to change and why, or
- Bring it up on [Discord](https://discord.com/invite/7wanVzCBWf).

Wait for the maintainer to agree on the approach before starting. PRs that show up without prior discussion will be closed, regardless of quality.

Small fixes (typos, obvious one-line bugs) still need an issue, but a short one is fine.

## Development setup

Requirements:

- Node.js >= 22.16.0 and [pnpm](https://pnpm.io) >= 10.0 (`npm` and `yarn` are blocked)
- Platform C/C++ build tools if you want the embedded terminal (node-pty is a native module)

```sh
pnpm install
pnpm electron:dev        # normal dev server
pnpm electron:rebuild    # rebuild node-pty for Electron's ABI (optional; the app runs without it)
```

## Before opening a PR

Run these from the repo root and make sure they pass:

```sh
pnpm format                                    # prettier
pnpm --filter texpile-editor check             # svelte-check
pnpm --filter texpile-editor lint              # prettier --check + eslint
pnpm --filter texpile-editor testonce          # vitest, single pass
```

## License

Texpile is licensed under [AGPL-3.0](LICENSE). By contributing, you agree that your contributions are licensed under the same terms.
