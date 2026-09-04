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

## Docs

The docs live in `docs/` as markdown, one file per page, and the landing site builds its `/docs` pages from them. A folder's `README.md` is the page for the folder. Each file starts with front matter (`description`, `section` on a top-level page (the sidebar group), and optionally `nav`, `blurb`, `icon`, `order`), then a `# heading` and a lead paragraph.

A few shapes get their own design on the site and still read as plain markdown on GitHub:

- `> [!NOTE]` for a callout.
- An image on a line of its own for a figure, with the title as its caption. Add `#narrow` to the path for a small screenshot. Two images on one line sit side by side.
- A table headed `Where to find it | Path | Note` for the "where to find it" block, and one headed `Shortcut | Action` for a shortcut table.
- A list of links to other pages for a card grid, and a paragraph of only links for a row of arrow links.

Link to other pages by their `.md` path, relative to the file. The build fails on a link or image that points nowhere. The landing dev server reloads on any change under `docs/`, new files included.

## Before opening a PR

Run these from the repo root and make sure they pass:

```sh
pnpm format                                    # prettier
pnpm --filter texpile-editor check             # svelte-check
pnpm --filter texpile-editor lint              # prettier --check + eslint
pnpm --filter texpile-editor testonce          # vitest, single pass
```

## Contributing and the CLA

Texpile is licensed under [AGPL-3.0](LICENSE).

Before we can merge your first pull request, you'll need to sign our
[CLA](https://cla-assistant.io/texpile/texpile). Our CLA Assistant bot will
comment on your PR with a link.
