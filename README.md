# Swagger Enhancer

A lightweight browser extension that adds a navigation sidebar to [Swagger UI](https://swagger.io/tools/swagger-ui/) pages, making large API references easier to browse, filter, and authenticate against.

## Why

Swagger UI works well for a handful of endpoints, but once an API grows to dozens or hundreds it becomes one long scrolling page. Swagger Enhancer adds a fixed sidebar to any Swagger UI page so you can jump straight to the endpoint you need.

## Features

- **Grouped endpoint list** — every operation in the spec, organised by tag, with HTTP method labels and per-group count badges.
- **Collapsible groups** — groups start collapsed when there are more than ~20 endpoints so the sidebar stays scannable.
- **Filter box** — search by path, method, or tag. Matching groups auto-expand while you type.
- **One-click navigation** — clicking an item expands the operation in the main view and scrolls it into focus.
- **Live auth indicator** — a status badge shows whether you're authorized; clicking it opens Swagger's Authorize dialog.
- **Zero configuration** — open any Swagger UI page and the sidebar appears.
- **Zero data collection** — no analytics, no telemetry, no network requests. Source is open and auditable.

## Install

- **Chrome / Edge / Brave** — [Chrome Web Store listing](#) *(link once published)*
- **Firefox** — [Firefox Add-ons listing](#) *(link once published)*

To run from source, see [Building from source](#building-from-source) below.

## Usage

Install, then open any page that renders Swagger UI (for example the [Petstore demo](https://petstore.swagger.io/)). The sidebar injects itself once Swagger has finished rendering. On pages without Swagger UI the extension does nothing.

## Permissions

The extension requests the `<all_urls>` host match in its `content_scripts` entry. Swagger UI is self-hosted — there's no central domain it lives at — so the content script has to be allowed to run on each page the user opens, detect whether Swagger UI is present in the DOM, and inject the sidebar only when it is. On every other page the script exits without doing anything.

The extension makes no network requests, reads no page data beyond the endpoint list already rendered by Swagger UI, and transmits nothing off the device.

## Building from source

Requirements: Node.js 22 and npm.

```bash
git clone https://github.com/xrasod/swagger-enhancements.git
cd swagger-enhancements
npm install
npm run build
```

The build produces unpacked extensions in `dist/chrome/` and `dist/firefox/`, plus zipped artifacts for store upload.

**Load into Chrome:**
1. Visit `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select `dist/chrome/`

**Load into Firefox:**
1. Visit `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…** and select `dist/firefox/manifest.json`

For watch mode during development:

```bash
npm run watch
```

## Project layout

```
src/
  content.ts      # the content script — detection, sidebar, filter, auth indicator
  styles.css      # sidebar styling
manifests/
  chrome.json     # Manifest V3 for Chromium browsers
  firefox.json    # Manifest V3 for Firefox
build.mjs         # esbuild-based build that emits dist/<browser>/
```

The extension intentionally ships with zero runtime dependencies.

## Contributing

Bug reports and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, code standards, and PR expectations.

## License

[MIT](LICENSE)
