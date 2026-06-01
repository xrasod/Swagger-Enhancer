# Contributing to Endpoint Atlas

Thanks for your interest in contributing! This document outlines how to get set up, the standards we follow, and how to submit changes.

## Getting started

### Prerequisites

- Node.js 22 (matches CI)
- npm

### Setup

```bash
git clone https://github.com/<your-fork>/endpoint-atlas.git
cd endpoint-atlas
npm install
```

### Build

```bash
npm run build      # one-shot build into dist/
npm run watch      # rebuild on file changes
```

The build produces unpacked extensions in `dist/chrome/` and `dist/firefox/`.

### Loading the extension locally

**Chrome / Chromium:**
1. Visit `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select `dist/chrome/`

**Firefox:**
1. Visit `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…** and select `dist/firefox/manifest.json`

Open any Swagger UI page to see the sidebar inject.

## Development workflow

1. Create a branch off `main`:
   ```bash
   git checkout -b feature/short-description
   ```
2. Make your changes in `src/`.
3. Run the checks that CI runs:
   ```bash
   npm run typecheck
   npm run lint
   npm run build
   ```
4. Test manually against a real Swagger UI page (the [Petstore demo](https://petstore.swagger.io/) is a good baseline).
5. Commit with a clear message and open a pull request against `main`.

## Code standards

- **TypeScript** — all source lives in `src/` and must pass `tsc --noEmit`.
- **Lint** — code must pass `npm run lint` with no warnings.
- **No new runtime dependencies** without discussion — the extension intentionally ships with zero runtime deps.
- Keep the content script lightweight; it runs on every Swagger UI page.

## Pull requests

A good PR:

- Targets a single concern (one bug fix, one feature).
- Includes a description of *what* changed and *why*.
- Notes any Swagger UI versions you tested against.
- Includes screenshots or a short clip for UI-visible changes.
- Passes CI (typecheck, lint, build).

## Reporting bugs

When filing an issue, please include:

- Browser and version (Chrome / Firefox / etc.)
- Extension version
- The Swagger UI page where the issue occurs (URL if public, or the Swagger UI version)
- Steps to reproduce
- Expected vs. actual behavior
- Console errors, if any

## Feature requests

Open an issue describing the use case before starting work on a larger feature — it helps avoid duplicate effort and ensures the change fits the project's scope.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
