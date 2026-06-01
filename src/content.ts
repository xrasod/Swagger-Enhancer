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
  element: HTMLElement;
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
  const target = document.querySelector(".auth-wrapper") ?? document.querySelector(".swagger-ui");
  if (!target) return;
  const observer = new MutationObserver(() => onAuthChange(getAuthStatus()));
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
        element: block as HTMLElement,
      });
    });

    if (ops.length > 0) groups.push({ tag, ops });
  });

  return groups;
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

function buildEndpointItem(endpoint: Endpoint): HTMLLIElement {
  const { method, path, element } = endpoint;

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

  item.addEventListener("click", () => {
    const isOpen = element.classList.contains("is-open");

    if (!isOpen) {
      const trigger =
        element.querySelector<HTMLElement>("button.opblock-summary-control") ??
        element.querySelector<HTMLElement>(".opblock-summary");

      if (trigger) {
        trigger.click();
        setTimeout(() => element.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
      }
    } else {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    element.classList.add("endpoint-atlas-highlight");
    setTimeout(() => element.classList.remove("endpoint-atlas-highlight"), 1500);
  });

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
  ops.forEach((op) => list.appendChild(buildEndpointItem(op)));

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
  title.textContent = "API Navigator";

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

  const groups = parseEndpoints();
  log(`Parsed ${groups.length} groups:`, groups.map((g) => g.tag));
  if (groups.length === 0) {
    log("parseEndpoints() returned 0 groups — selector mismatch?");
    return;
  }

  const sidebar = buildSidebar(groups, getAuthStatus());
  document.body.appendChild(sidebar);

  document.querySelector(".swagger-ui")?.classList.add("endpoint-atlas-shifted");

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
const navObserver = new MutationObserver(() => {
  const currentPath = location.pathname + location.search;
  if (currentPath === lastPath) return;
  lastPath = currentPath;
  document.getElementById(SIDEBAR_ID)?.remove();
  document.querySelector(".endpoint-atlas-shifted")?.classList.remove("endpoint-atlas-shifted");
  init();
});
navObserver.observe(document.body, { childList: true, subtree: true });

init();
