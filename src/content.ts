const SIDEBAR_ID = "endpoint-atlas-sidebar";
const COLLAPSE_THRESHOLD = 20;

const METHOD_COLORS: Record<string, string> = {
  get: "#61affe",
  post: "#49cc90",
  put: "#fca130",
  delete: "#f93e3e",
  patch: "#50e3c2",
  head: "#9012fe",
  options: "#0d5aa7",
};

type AuthStatus = "authorized" | "unauthorized" | "unknown";

interface Endpoint {
  method: string;
  path: string;
}

interface EndpointGroup {
  tag: string;
  ops: Endpoint[];
}

const log = (...args: unknown[]) => console.debug("[EndpointAtlas]", ...args);

// ── Detection ──────────────────────────────────────────────────────────────

function waitForSelector(selector: string, timeoutMs = 20_000): Promise<Element | null> {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) {
      resolve(el);
      return;
    }

    const observer = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (found) {
        observer.disconnect();
        resolve(found);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

// ── Auth status ────────────────────────────────────────────────────────────

function getAuthStatus(): AuthStatus {
  const btn = document.querySelector(".btn.authorize");
  if (!btn) return "unknown";
  const hasLocked = btn.querySelector("svg.locked") !== null || btn.classList.contains("locked");
  return hasLocked ? "authorized" : "unauthorized";
}

function watchAuthStatus(onAuthChange: (status: AuthStatus) => void): void {
  // Scope to the small, stable auth region only. The old fallback observed the
  // entire .swagger-ui subtree with attributes:true, so this callback fired on
  // every focus/hover/keystroke across the page — very CPU-heavy on large
  // specs. If there's no auth UI at all, there's nothing to watch.
  const target = document.querySelector(".auth-wrapper") ?? document.querySelector(".scheme-container");
  if (!target) return;

  // Auth status changes only when the user authorizes/logs out — rare and not
  // latency-sensitive — so coalesce bursts of mutations into one check.
  let debounce: ReturnType<typeof setTimeout>;
  const observer = new MutationObserver(() => {
    clearTimeout(debounce);
    debounce = setTimeout(() => onAuthChange(getAuthStatus()), 150);
  });
  observer.observe(target, { childList: true, subtree: true, attributes: true });
}

// ── Endpoint parsing ───────────────────────────────────────────────────────

function parseEndpoints(): EndpointGroup[] {
  const sections = document.querySelectorAll(".opblock-tag-section");
  const groups: EndpointGroup[] = [];

  sections.forEach((section) => {
    const tagEl = section.querySelector("[data-tag]");
    const tag = tagEl?.getAttribute("data-tag") ?? "Default";

    const ops: Endpoint[] = [];
    section.querySelectorAll(".opblock").forEach((block) => {
      const methodEl = block.querySelector(".opblock-summary-method");
      const pathEl = block.querySelector(".opblock-summary-path, .opblock-summary-path__deprecated");
      if (!methodEl || !pathEl) return;

      ops.push({
        method: methodEl.textContent?.trim().toLowerCase() ?? "",
        path: pathEl.querySelector("span")?.textContent?.trim() ?? pathEl.textContent?.trim() ?? "",
      });
    });

    if (ops.length > 0) groups.push({ tag, ops });
  });

  return groups;
}

// ── Collapsed-tag handling ─────────────────────────────────────────────────
//
// When Swagger is configured with docExpansion:"none", tag groups start
// collapsed and the .opblock operation nodes aren't mounted until a tag is
// expanded. parseEndpoints() then sees zero operations. To enumerate them from
// the DOM (without the spec JSON, which not every deployment exposes) we expand
// the collapsed tags, parse, and restore each to its original state.

function poll<T>(fn: () => T | null | undefined, timeoutMs: number, intervalMs = 80): Promise<T | null> {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      const value = fn();
      if (value) return resolve(value);
      if (performance.now() - start >= timeoutMs) return resolve(null);
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

function isTagOpen(section: Element): boolean {
  return (
    section.classList.contains("is-open") ||
    section.querySelector(".opblock-tag")?.getAttribute("data-is-open") === "true"
  );
}

// Wait until the operation count stops growing — all expanded tags have mounted.
async function waitForOpblocksToSettle(timeoutMs: number): Promise<void> {
  const start = performance.now();
  let last = -1;
  while (performance.now() - start < timeoutMs) {
    const count = document.querySelectorAll(".opblock").length;
    if (count > 0 && count === last) return;
    last = count;
    await new Promise((r) => setTimeout(r, 120));
  }
}

async function parseEndpointsExpandingIfNeeded(): Promise<EndpointGroup[]> {
  const groups = parseEndpoints();
  if (groups.length > 0) return groups; // fast path: operations already rendered

  const sections = Array.from(document.querySelectorAll<HTMLElement>(".opblock-tag-section"));
  const opened: HTMLElement[] = [];
  for (const section of sections) {
    const header = section.querySelector<HTMLElement>(".opblock-tag");
    if (header && !isTagOpen(section)) {
      header.click();
      opened.push(header);
    }
  }
  if (opened.length === 0) return groups; // nothing collapsed — genuinely empty

  log(`Expanding ${opened.length} collapsed tag(s) to read operations…`);
  await waitForOpblocksToSettle(3000);
  const expandedGroups = parseEndpoints();

  // Restore each tag we opened back to its collapsed state.
  for (const header of opened) header.click();

  return expandedGroups;
}

// ── Navigation ─────────────────────────────────────────────────────────────

function findTagSection(tag: string): HTMLElement | null {
  const header = document.querySelector(`.opblock-tag[data-tag="${CSS.escape(tag)}"]`);
  return (header?.closest(".opblock-tag-section") as HTMLElement) ?? null;
}

function findOpblock(section: HTMLElement, method: string, path: string): HTMLElement | null {
  return (
    Array.from(section.querySelectorAll<HTMLElement>(".opblock")).find((block) => {
      const m = block.querySelector(".opblock-summary-method")?.textContent?.trim().toLowerCase();
      const pathEl = block.querySelector(".opblock-summary-path, .opblock-summary-path__deprecated");
      const p = pathEl?.querySelector("span")?.textContent?.trim() ?? pathEl?.textContent?.trim();
      return m === method && p === path;
    }) ?? null
  );
}

async function navigateToEndpoint(tag: string, method: string, path: string): Promise<void> {
  const section = findTagSection(tag);
  if (!section) return;

  // Expand the tag first if collapsed — the operation isn't mounted otherwise.
  if (!isTagOpen(section)) {
    section.querySelector<HTMLElement>(".opblock-tag")?.click();
    await poll(() => findOpblock(section, method, path), 2000);
  }

  const opblock = findOpblock(section, method, path);
  if (!opblock) return;

  if (!opblock.classList.contains("is-open")) {
    const trigger =
      opblock.querySelector<HTMLElement>("button.opblock-summary-control") ??
      opblock.querySelector<HTMLElement>(".opblock-summary");
    if (trigger) {
      trigger.click();
      setTimeout(() => opblock.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }
  } else {
    opblock.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  opblock.classList.add("endpoint-atlas-highlight");
  setTimeout(() => opblock.classList.remove("endpoint-atlas-highlight"), 1500);
}

// ── SVG helpers ────────────────────────────────────────────────────────────

function makeSvg(viewBox: string, width: number, height: number): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("aria-hidden", "true");
  return svg;
}

const LOCK_PATH: Record<AuthStatus, string> = {
  authorized:
    "M8 1a3 3 0 0 0-3 3v1H3.5A1.5 1.5 0 0 0 2 6.5v7A1.5 1.5 0 0 0 3.5 15h9a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 12.5 5H11V4a3 3 0 0 0-3-3zm2 4V4a2 2 0 1 0-4 0v1h4zm-2 4a1 1 0 0 1 .5.87V11.5a.5.5 0 0 1-1 0v-1.63A1 1 0 1 1 8 9z",
  unauthorized:
    "M8 1a3 3 0 0 0-3 3v1H3.5A1.5 1.5 0 0 0 2 6.5v7A1.5 1.5 0 0 0 3.5 15h9a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 12.5 5H6V4a2 2 0 0 1 3.716-.503.75.75 0 1 0 1.392-.564A3.5 3.5 0 0 0 8 1zm-1 9.87V11.5a.5.5 0 0 0 1 0v-1.63a1 1 0 1 0-1 0z",
  unknown:
    "M8 1a3 3 0 0 0-3 3v1H3.5A1.5 1.5 0 0 0 2 6.5v7A1.5 1.5 0 0 0 3.5 15h9a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 12.5 5H6V4a2 2 0 0 1 3.716-.503.75.75 0 1 0 1.392-.564A3.5 3.5 0 0 0 8 1zm-1 9.87V11.5a.5.5 0 0 0 1 0v-1.63a1 1 0 1 0-1 0z",
};

const AUTH_LABEL: Record<AuthStatus, string> = {
  authorized: "Authorized",
  unauthorized: "Not authorized",
  unknown: "Auth unknown",
};

// ── Request timing ─────────────────────────────────────────────────────────
//
// Swagger UI shows the status and body of a "Try it out" call but never how
// long it took. The page makes those calls with its own fetch/XHR; even though
// our content script runs in an isolated JS world, the Performance Timeline is
// document-scoped, so a PerformanceObserver here sees the page's resource
// entries. We read the real network `duration` from there (available even
// cross-origin) and stamp it into Swagger's own response panel.

const SVGNS = "http://www.w3.org/2000/svg";
const MAX_RECENT_ENTRIES = 80;
const MAX_HISTORY = 50; // per-endpoint timing samples kept for min/avg/max

// Recent resource-timing entries (own rolling buffer so the page's timeline
// buffer can't evict one out from under us between request and render).
const recentEntries: PerformanceResourceTiming[] = [];
// method+path → durations (ms), in call order, for min/avg/max.
const timingHistory = new Map<string, number[]>();
let resourceObserverStarted = false;

function startResourceTimingObserver(): void {
  if (resourceObserverStarted) return;
  resourceObserverStarted = true;
  try {
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const e = entry as PerformanceResourceTiming;
        if (e.initiatorType === "fetch" || e.initiatorType === "xmlhttprequest") {
          recentEntries.push(e);
        }
      }
      if (recentEntries.length > MAX_RECENT_ENTRIES) {
        recentEntries.splice(0, recentEntries.length - MAX_RECENT_ENTRIES);
      }
    });
    obs.observe({ type: "resource", buffered: true });
  } catch (err) {
    log("PerformanceObserver unavailable — timing disabled:", err);
  }
}

function findEntryForUrl(url: string, minStartTime: number): PerformanceResourceTiming | null {
  const norm = (u: string) => u.split("#")[0].replace(/\/+$/, "");
  const target = norm(url);
  let best: PerformanceResourceTiming | null = null;
  for (const e of recentEntries) {
    // minStartTime is the Execute-click time, so a stale entry from a previous
    // run of the same endpoint is excluded — we only match this click's request.
    const matches = (e.name === url || norm(e.name) === target) && e.startTime >= minStartTime;
    if (matches && (!best || e.startTime > best.startTime)) best = e;
  }
  return best;
}

function getOpblockKey(opblock: HTMLElement): string | null {
  const method = opblock.querySelector(".opblock-summary-method")?.textContent?.trim().toLowerCase();
  const pathEl = opblock.querySelector(".opblock-summary-path, .opblock-summary-path__deprecated");
  const path = pathEl?.querySelector("span")?.textContent?.trim() ?? pathEl?.textContent?.trim();
  if (!method || !path) return null;
  return `${method} ${path}`;
}

function readResolvedUrl(opblock: HTMLElement): string | null {
  const pre = opblock.querySelector(".request-url pre, .request-url .microlight");
  const text = pre?.textContent?.trim();
  return text ?? null;
}

function readStatusCode(opblock: HTMLElement): string | null {
  const el = opblock.querySelector(".live-responses-table tr.response .response-col_status");
  const text = el?.textContent?.trim();
  if (!text) return null;
  return text.match(/\d{3}/)?.[0] ?? text;
}

function statusClass(status: string | null): string {
  const code = status ? parseInt(status, 10) : NaN;
  if (code >= 200 && code < 300) return "endpoint-atlas-timing-2xx";
  if (code >= 300 && code < 400) return "endpoint-atlas-timing-3xx";
  if (code >= 400 && code < 500) return "endpoint-atlas-timing-4xx";
  if (code >= 500) return "endpoint-atlas-timing-5xx";
  return "endpoint-atlas-timing-unknown";
}

// Dark Swagger themes are usually custom CSS, not tied to the OS scheme, so
// detect by sampling the effective background behind the insertion point.
function isDarkBackground(el: HTMLElement): boolean {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const rgb = getComputedStyle(node).backgroundColor.match(/\d+(\.\d+)?/g);
    if (!rgb || (rgb.length === 4 && parseFloat(rgb[3]) === 0)) continue;
    const [r, g, b] = rgb.slice(0, 3).map(Number);
    return r * 0.299 + g * 0.587 + b * 0.114 < 128;
  }
  return false;
}

function readResponseSize(opblock: HTMLElement, entry: PerformanceResourceTiming): number | null {
  // transferSize/encodedBodySize are populated same-origin (or with a
  // Timing-Allow-Origin header); fall back to the rendered body length.
  if (entry.encodedBodySize > 0) return entry.encodedBodySize;
  const body = opblock.querySelector(
    ".live-responses-table tr.response .response-col_description .microlight, .live-responses-table tr.response .highlight-code",
  );
  const text = body?.textContent;
  return text ? new TextEncoder().encode(text).length : null;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;
}

function buildClockIcon(): SVGSVGElement {
  const svg = makeSvg("0 0 16 16", 13, 13);
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.4");
  svg.setAttribute("stroke-linecap", "round");
  svg.style.flexShrink = "0";

  const circle = document.createElementNS(SVGNS, "circle");
  circle.setAttribute("cx", "8");
  circle.setAttribute("cy", "9");
  circle.setAttribute("r", "5");

  const hands = document.createElementNS(SVGNS, "path");
  hands.setAttribute("d", "M8 6.5V9l1.8 1.2");

  const crown = document.createElementNS(SVGNS, "path");
  crown.setAttribute("d", "M6.3 2.2h3.4M8 2.2v1.6");

  svg.append(circle, hands, crown);
  return svg;
}

function appendSeparator(line: HTMLElement): void {
  const sep = document.createElement("span");
  sep.className = "endpoint-atlas-timing-sep";
  sep.textContent = "·";
  line.appendChild(sep);
}

function renderTimingLine(
  opblock: HTMLElement,
  duration: number,
  status: string | null,
  size: number | null,
  durations: number[],
): void {
  const wrap =
    opblock.querySelector(".responses-wrapper .responses-inner") ??
    opblock.querySelector(".responses-wrapper");
  if (!wrap) return;

  // Signature guard: Swagger (React) re-renders the response area, which our
  // own MutationObserver sees. Only touch the DOM when the content changed, so
  // we don't trigger an endless observe→inject→observe loop.
  const min = Math.min(...durations);
  const max = Math.max(...durations);
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  const sig = [
    Math.round(duration),
    status,
    size,
    durations.length,
    Math.round(min),
    Math.round(avg),
    Math.round(max),
  ].join("|");

  let line = wrap.querySelector<HTMLElement>(".endpoint-atlas-timing");
  if (line && line.dataset.sig === sig) return;
  if (!line) {
    line = document.createElement("div");
    line.className = "endpoint-atlas-timing";
    wrap.insertBefore(line, wrap.firstChild);
  }
  line.dataset.sig = sig;
  line.classList.toggle("endpoint-atlas-timing--dark", isDarkBackground(wrap));
  line.textContent = "";

  const primary = document.createElement("span");
  primary.className = "endpoint-atlas-timing-primary";
  primary.append(buildClockIcon(), document.createTextNode(formatMs(duration)));
  line.appendChild(primary);

  if (status) {
    appendSeparator(line);
    const statusEl = document.createElement("span");
    statusEl.className = `endpoint-atlas-timing-status ${statusClass(status)}`;
    statusEl.textContent = status;
    line.appendChild(statusEl);
  }

  if (size !== null) {
    appendSeparator(line);
    const sizeEl = document.createElement("span");
    sizeEl.textContent = formatBytes(size);
    line.appendChild(sizeEl);
  }

  if (durations.length > 1) {
    const stats = document.createElement("span");
    stats.className = "endpoint-atlas-timing-stats";
    stats.textContent = `min ${formatMs(min)} · avg ${formatMs(avg)} · max ${formatMs(max)} · ${durations.length} calls`;
    line.appendChild(stats);
  }
}

// Returns true once it has matched and rendered this click's request; the
// caller's poll loop retries until the resource entry shows up.
function handleResponse(opblock: HTMLElement, clickTime: number): boolean {
  const url = readResolvedUrl(opblock);
  if (!url) return false;

  const entry = findEntryForUrl(url, clickTime);
  if (!entry) return false;

  const key = getOpblockKey(opblock);
  if (!key) return false;

  // Record each distinct request once. The matched entry's startTime uniquely
  // identifies the call; re-renders of the same result reuse it.
  const startTag = String(entry.startTime);
  if (opblock.dataset.eaTimedStart !== startTag) {
    const durations = timingHistory.get(key) ?? [];
    durations.push(entry.duration);
    if (durations.length > MAX_HISTORY) durations.splice(0, durations.length - MAX_HISTORY);
    timingHistory.set(key, durations);
    opblock.dataset.eaTimedStart = startTag;
  }

  renderTimingLine(
    opblock,
    entry.duration,
    readStatusCode(opblock),
    readResponseSize(opblock, entry),
    timingHistory.get(key) ?? [],
  );
  return true;
}

// A response can only appear after the user clicks Execute, so we listen for
// that one click (cheap, event-delegated) rather than observing the whole app
// for mutations — a global subtree/characterData observer fires on every
// keystroke in the parameter and request-body fields and makes typing janky.
let responseClickListenerAttached = false;
const activeResponseWatchers = new WeakMap<HTMLElement, () => void>();

function watchResponsePanels(): void {
  if (responseClickListenerAttached) return;
  responseClickListenerAttached = true;
  document.addEventListener(
    "click",
    (ev) => {
      const btn = (ev.target as HTMLElement | null)?.closest?.(".btn.execute, .execute");
      if (!btn) return;
      const opblock = btn.closest(".opblock") as HTMLElement | null;
      // Capture-phase, so this runs before Swagger fires the request — the
      // timestamp cleanly separates this call's resource entry from any prior.
      if (opblock) awaitResponseRender(opblock, performance.now());
    },
    true,
  );
}

const RESPONSE_POLL_MS = 200;
const RESPONSE_POLL_MAX = 100; // ~20s ceiling before giving up

// After an Execute click, poll just this opblock until the live response for
// THIS request renders, then stamp the timing and stop. Polling a couple of
// selectors on a timer is far cheaper than a subtree MutationObserver, which
// would fire on every mutation while Swagger syntax-highlights a large body.
function awaitResponseRender(opblock: HTMLElement, clickTime: number): void {
  activeResponseWatchers.get(opblock)?.(); // re-execute: drop the prior watcher

  let done = false;
  let attempts = 0;
  let timer: ReturnType<typeof setTimeout>;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    activeResponseWatchers.delete(opblock);
  };

  const poll = () => {
    if (done) return;
    const hasStatus = opblock.querySelector(".live-responses-table tr.response .response-col_status");
    const hasUrl = opblock.querySelector(".request-url");
    // handleResponse only succeeds once this click's resource entry exists, so
    // a stale response left over from a previous run won't end the watch early.
    if (hasStatus && hasUrl && handleResponse(opblock, clickTime)) return finish();
    if (++attempts >= RESPONSE_POLL_MAX) return finish();
    timer = setTimeout(poll, RESPONSE_POLL_MS);
  };

  activeResponseWatchers.set(opblock, finish);
  timer = setTimeout(poll, RESPONSE_POLL_MS);
}

// ── Sidebar rendering ──────────────────────────────────────────────────────

function buildAuthBadge(status: AuthStatus): HTMLButtonElement {
  const badge = document.createElement("button");
  badge.className = `endpoint-atlas-auth-badge endpoint-atlas-auth-${status}`;
  badge.title = "Click to open authorization dialog";
  badge.type = "button";

  const dot = document.createElement("span");
  dot.className = "endpoint-atlas-auth-dot";

  const label = document.createElement("span");
  label.textContent = AUTH_LABEL[status];

  const icon = makeSvg("0 0 16 16", 11, 11);
  icon.setAttribute("fill", "currentColor");
  icon.style.flexShrink = "0";
  const iconPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  iconPath.setAttribute("d", LOCK_PATH[status]);
  icon.appendChild(iconPath);

  badge.append(dot, label, icon);
  badge.addEventListener("click", () => document.querySelector<HTMLElement>(".btn.authorize")?.click());

  return badge;
}

function buildChevron(): SVGSVGElement {
  const svg = makeSvg("0 0 12 12", 12, 12);
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.classList.add("endpoint-atlas-chevron");
  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  polyline.setAttribute("points", "2,4 6,8 10,4");
  svg.appendChild(polyline);
  return svg;
}

function buildEndpointItem(endpoint: Endpoint, tag: string): HTMLLIElement {
  const { method, path } = endpoint;

  const item = document.createElement("li");
  item.className = "endpoint-atlas-item";
  item.dataset.method = method;
  item.dataset.path = path.toLowerCase();

  const methodBadge = document.createElement("span");
  methodBadge.className = "endpoint-atlas-method";
  methodBadge.textContent = method.toUpperCase();
  methodBadge.style.backgroundColor = METHOD_COLORS[method] ?? "#aaa";

  const pathLabel = document.createElement("span");
  pathLabel.className = "endpoint-atlas-path";
  pathLabel.textContent = path;
  pathLabel.title = path;

  item.append(methodBadge, pathLabel);
  item.addEventListener("click", () => void navigateToEndpoint(tag, method, path));

  return item;
}

function buildGroupEl(group: EndpointGroup, startCollapsed: boolean): HTMLDivElement {
  const { tag, ops } = group;

  const groupEl = document.createElement("div");
  groupEl.className = "endpoint-atlas-group";
  groupEl.dataset.tag = tag;
  groupEl.dataset.collapsed = String(startCollapsed);

  const header = document.createElement("div");
  header.className = "endpoint-atlas-group-header endpoint-atlas-group-header--collapsible";

  const tagLabel = document.createElement("span");
  tagLabel.textContent = tag;

  const countBadge = document.createElement("span");
  countBadge.className = "endpoint-atlas-group-count";
  countBadge.textContent = String(ops.length);

  header.append(tagLabel, countBadge, buildChevron());
  header.addEventListener("click", () => {
    groupEl.dataset.collapsed = groupEl.dataset.collapsed === "true" ? "false" : "true";
  });

  const list = document.createElement("ul");
  list.className = "endpoint-atlas-items";
  ops.forEach((op) => list.appendChild(buildEndpointItem(op, tag)));

  groupEl.append(header, list);
  return groupEl;
}

function buildNav(groups: EndpointGroup[]): HTMLElement {
  const totalOps = groups.reduce((sum, g) => sum + g.ops.length, 0);
  const startCollapsed = totalOps > COLLAPSE_THRESHOLD;

  const nav = document.createElement("nav");
  nav.className = "endpoint-atlas-nav";
  groups.forEach((group) => nav.appendChild(buildGroupEl(group, startCollapsed)));
  return nav;
}

function buildSidebar(groups: EndpointGroup[], authStatus: AuthStatus): HTMLDivElement {
  const sidebar = document.createElement("div");
  sidebar.id = SIDEBAR_ID;

  const header = document.createElement("div");
  header.className = "endpoint-atlas-header";

  const title = document.createElement("div");
  title.className = "endpoint-atlas-title";
  title.textContent = "Endpoint Atlas";

  const authBadge = buildAuthBadge(authStatus);
  authBadge.id = "endpoint-atlas-auth-badge";

  header.append(title, authBadge);

  const searchWrap = document.createElement("div");
  searchWrap.className = "endpoint-atlas-search-wrap";
  const search = document.createElement("input");
  search.type = "text";
  search.placeholder = "Filter endpoints…";
  search.className = "endpoint-atlas-search";
  searchWrap.appendChild(search);

  const nav = buildNav(groups);

  search.addEventListener("input", () => {
    const query = search.value.toLowerCase().trim();
    const liveNav = search.closest(`#${SIDEBAR_ID}`)?.querySelector(".endpoint-atlas-nav");
    if (!liveNav) return;

    liveNav.querySelectorAll<HTMLElement>(".endpoint-atlas-group").forEach((groupEl) => {
      let groupVisible = false;

      groupEl.querySelectorAll<HTMLElement>(".endpoint-atlas-item").forEach((item) => {
        const visible =
          !query ||
          (item.dataset.path ?? "").includes(query) ||
          (item.dataset.method ?? "").includes(query) ||
          (groupEl.dataset.tag ?? "").toLowerCase().includes(query);

        item.style.display = visible ? "" : "none";
        if (visible) groupVisible = true;
      });

      groupEl.style.display = !query || groupVisible ? "" : "none";

      if (query && groupVisible) {
        groupEl.dataset.searching = "true";
      } else {
        delete groupEl.dataset.searching;
      }
    });
  });

  sidebar.append(header, searchWrap, nav);
  return sidebar;
}

// ── Main init ──────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  if (document.getElementById(SIDEBAR_ID)) return;

  log("Waiting for .swagger-ui root…");
  const swaggerRoot = await waitForSelector(".swagger-ui");
  if (!swaggerRoot) {
    log("Not a Swagger page (timed out waiting for .swagger-ui) — exiting.");
    return;
  }
  log("Found .swagger-ui. Waiting for endpoint blocks…");

  const firstSection = await waitForSelector(".opblock-tag-section");
  if (!firstSection) {
    log("Found .swagger-ui but no .opblock-tag-section appeared — check the DOM selectors.");
    return;
  }
  log("Endpoints found. Parsing…");

  const groups = await parseEndpointsExpandingIfNeeded();
  log(`Parsed ${groups.length} groups:`, groups.map((g) => g.tag));
  if (groups.length === 0) {
    log("parseEndpointsExpandingIfNeeded() returned 0 groups — selector mismatch?");
    return;
  }

  const sidebar = buildSidebar(groups, getAuthStatus());
  document.body.appendChild(sidebar);

  document.querySelector(".swagger-ui")?.classList.add("endpoint-atlas-shifted");

  startResourceTimingObserver();
  watchResponsePanels();

  watchAuthStatus((status) => {
    const badge = document.getElementById("endpoint-atlas-auth-badge");
    if (!badge) return;
    const fresh = buildAuthBadge(status);
    fresh.id = "endpoint-atlas-auth-badge";
    badge.replaceWith(fresh);
  });

  // Re-parse if Swagger re-renders (e.g. spec reload)
  let debounceTimer: ReturnType<typeof setTimeout>;
  const rerenderObserver = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const fresh = parseEndpoints();
      if (fresh.length === 0) return;
      sidebar.querySelector(".endpoint-atlas-nav")?.replaceWith(buildNav(fresh));
    }, 500);
  });

  const tagContainer = document.querySelector(".opblock-tag-section");
  if (tagContainer?.parentElement) {
    rerenderObserver.observe(tagContainer.parentElement, { childList: true });
  }
}

// Swagger sometimes lives in a SPA — re-check on actual page navigation.
// Ignore hash-only changes: Swagger updates the hash on every endpoint click.
let lastPath = location.pathname + location.search;
function onPossibleNav(): void {
  const currentPath = location.pathname + location.search;
  if (currentPath === lastPath) return;
  lastPath = currentPath;
  document.getElementById(SIDEBAR_ID)?.remove();
  document.querySelector(".endpoint-atlas-shifted")?.classList.remove("endpoint-atlas-shifted");
  init();
}
// pushState navigations happen in the page's main world, which an isolated
// content script can't hook — so a coarse URL poll plus popstate is both
// robust and far cheaper than a body-wide subtree observer running forever.
window.addEventListener("popstate", onPossibleNav);
setInterval(onPossibleNav, 1000);

init();
