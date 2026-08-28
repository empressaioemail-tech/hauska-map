/**
 * On-map legend for the layers that carry a categorical or ordinal encoding.
 *
 * WHY IT LIVES IN THE RENDERER
 * ----------------------------
 * A choropleth with more than three classes is only legal with secondary
 * encoding, and the legend IS that encoding — the palette and the key have to
 * ship together or the colours are just decoration. Putting it in the renderer
 * rather than in either app means Smart Site and Command Center get it from the
 * same table that paints the map, so a palette edit can never leave a stale key
 * behind in one surface.
 *
 * LAYOUT DISCIPLINE: mounted collapsed as a single small chip in the lower-left,
 * sitting above the host app's own lower-left chrome, and it disappears entirely
 * when no layer that has a legend is visible. Styles are inline plus one scoped
 * <style> block, so it borrows nothing from either app's stylesheet and cannot
 * be broken by one.
 */

import { LAND_USE_LEGEND } from "./land-use-classes.js";
import { FEMA_LEGEND } from "./fema-zones.js";

export const LEGEND_ROOT_CLASS = "hauska-map-legend";
const STYLE_ELEMENT_ID = "hauska-map-legend-style";

/**
 * Pure model: which legend sections apply to a visible-layer set.
 * Exported separately from the DOM so the mapping is unit-testable.
 *
 * @param {Iterable<string>} visibleLayers
 * @returns {Array<{ id: string, title: string, note?: string, rows: object[] }>}
 */
export function legendSectionsFor(visibleLayers) {
  const visible = visibleLayers instanceof Set ? visibleLayers : new Set(visibleLayers || []);
  const sections = [];

  if (visible.has("zoning")) {
    sections.push({
      id: "land-use",
      title: "Land use",
      note: "County CAD state category. Assessor classification, not a municipal zoning district.",
      rows: LAND_USE_LEGEND.map((row) => ({
        key: row.key,
        swatch: row.fill,
        stroke: row.stroke,
        label: row.code === "—" ? row.label : `${row.code} · ${row.label}`,
        detail: row.wouldBeFilledBy ? `would be filled by: ${row.wouldBeFilledBy}` : null,
        hollow: false,
      })),
    });
  }

  if (visible.has("flood-zone") || visible.has("floodway")) {
    sections.push({
      id: "fema",
      title: "FEMA flood hazard",
      note: "A parcel can sit in more than one zone at once.",
      rows: FEMA_LEGEND.map((row) => ({
        key: row.key,
        swatch: row.fillOpacity === 0 ? "transparent" : row.fill,
        stroke: row.line,
        label: row.label,
        detail: row.zones,
        // The "out" row renders as an empty outlined box because that is exactly
        // how it renders on the map: no fill at all.
        hollow: row.fillOpacity === 0,
        inSfha: row.inSfha,
      })),
    });
  }

  return sections;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * In/out badge text for a FEMA row. Three states, never two: `null` means FEMA
 * published no determination, which is not the same as "outside".
 */
function sfhaBadge(inSfha) {
  if (inSfha === true) return { text: "IN", color: "#ffd9a0", bg: "rgba(242,162,60,0.18)" };
  if (inSfha === false) return { text: "OUT", color: "#c9d6e4", bg: "rgba(154,166,178,0.16)" };
  return { text: "—", color: "#9aa6b2", bg: "rgba(154,166,178,0.10)" };
}

function sectionHtml(section) {
  const rows = section.rows
    .map((row) => {
      const swatchStyle = row.hollow
        ? `background:transparent;border:1.5px dashed ${row.stroke}`
        : `background:${row.swatch};border:1px solid ${row.stroke}`;
      const badge =
        "inSfha" in row
          ? (() => {
              const b = sfhaBadge(row.inSfha);
              return `<span class="${LEGEND_ROOT_CLASS}__badge" style="color:${b.color};background:${b.bg}">${b.text}</span>`;
            })()
          : "";
      const detail = row.detail
        ? `<span class="${LEGEND_ROOT_CLASS}__detail">${escapeHtml(row.detail)}</span>`
        : "";
      return (
        `<li class="${LEGEND_ROOT_CLASS}__row">` +
        `<span class="${LEGEND_ROOT_CLASS}__swatch" style="${swatchStyle}"></span>` +
        `<span class="${LEGEND_ROOT_CLASS}__text"><span class="${LEGEND_ROOT_CLASS}__label">${escapeHtml(row.label)}</span>${detail}</span>` +
        badge +
        `</li>`
      );
    })
    .join("");
  const note = section.note
    ? `<p class="${LEGEND_ROOT_CLASS}__note">${escapeHtml(section.note)}</p>`
    : "";
  return (
    `<div class="${LEGEND_ROOT_CLASS}__section" data-section="${escapeHtml(section.id)}">` +
    `<p class="${LEGEND_ROOT_CLASS}__title">${escapeHtml(section.title)}</p>` +
    `<ul class="${LEGEND_ROOT_CLASS}__rows">${rows}</ul>` +
    note +
    `</div>`
  );
}

/** Build the panel markup for a section list. Exported for tests. */
export function legendPanelHtml(sections) {
  if (!sections.length) return "";
  return sections.map(sectionHtml).join("");
}

const CSS = `
.${LEGEND_ROOT_CLASS}{position:absolute;left:12px;bottom:52px;z-index:9;font:400 11px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;color:#e6edf3;max-width:min(300px,calc(100% - 24px));}
.${LEGEND_ROOT_CLASS}[hidden]{display:none;}
.${LEGEND_ROOT_CLASS}__toggle{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:8px;background:rgba(11,14,19,0.9);border:0.5px solid rgba(154,166,178,0.28);box-shadow:0 8px 24px rgba(0,0,0,0.5);color:#e6edf3;font:600 10px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:0.08em;text-transform:uppercase;cursor:pointer;}
.${LEGEND_ROOT_CLASS}__toggle:hover{border-color:rgba(154,166,178,0.5);}
.${LEGEND_ROOT_CLASS}__panel{margin-top:6px;padding:10px 12px;border-radius:10px;background:rgba(11,14,19,0.94);border:0.5px solid rgba(154,166,178,0.28);box-shadow:0 8px 24px rgba(0,0,0,0.55);max-height:46vh;overflow-y:auto;}
.${LEGEND_ROOT_CLASS}__panel[hidden]{display:none;}
.${LEGEND_ROOT_CLASS}__section + .${LEGEND_ROOT_CLASS}__section{margin-top:10px;padding-top:10px;border-top:0.5px solid rgba(154,166,178,0.22);}
.${LEGEND_ROOT_CLASS}__title{margin:0 0 6px;font:600 10px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:0.08em;text-transform:uppercase;color:#9aa6b2;}
.${LEGEND_ROOT_CLASS}__rows{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;}
.${LEGEND_ROOT_CLASS}__row{display:flex;align-items:center;gap:7px;}
.${LEGEND_ROOT_CLASS}__swatch{flex:0 0 auto;width:13px;height:13px;border-radius:3px;}
.${LEGEND_ROOT_CLASS}__text{display:flex;flex-direction:column;min-width:0;}
.${LEGEND_ROOT_CLASS}__label{white-space:normal;}
.${LEGEND_ROOT_CLASS}__detail{color:#9aa6b2;font-size:10px;}
.${LEGEND_ROOT_CLASS}__badge{margin-left:auto;flex:0 0 auto;padding:1px 5px;border-radius:4px;font:600 9px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:0.06em;}
.${LEGEND_ROOT_CLASS}__note{margin:6px 0 0;color:#9aa6b2;font-size:10px;}
@media (max-width:640px){.${LEGEND_ROOT_CLASS}{bottom:106px;}}
.${LEGEND_ROOT_CLASS}--bubble{left:12px;bottom:182px;z-index:11;display:flex;flex-direction:column-reverse;align-items:flex-start;gap:8px;max-width:min(300px,calc(100% - 24px));}
.${LEGEND_ROOT_CLASS}--bubble .${LEGEND_ROOT_CLASS}__toggle{width:34px;height:34px;padding:0;border-radius:50%;letter-spacing:0;text-transform:none;box-shadow:0 4px 14px rgba(0,0,0,0.35);justify-content:center;}
.${LEGEND_ROOT_CLASS}--bubble .${LEGEND_ROOT_CLASS}__panel{margin-top:0;}
`;

/**
 * Inject the legend stylesheet. EXPORTED because the legend markup is now
 * rendered in two places — this module's own DOM legend, and Property
 * Explorer's left column, which reuses `legendPanelHtml`. Whoever renders the
 * markup must also install these styles: the row/swatch/badge layout IS the
 * legend, and without it the markup collapses into one run of text.
 */
export function ensureLegendStyles(doc) {
  return ensureStyles(doc);
}

function ensureStyles(doc) {
  if (!doc || typeof doc.getElementById !== "function") return;
  if (doc.getElementById(STYLE_ELEMENT_ID)) return;
  const el = doc.createElement("style");
  el.id = STYLE_ELEMENT_ID;
  el.textContent = CSS;
  (doc.head || doc.body || doc.documentElement)?.appendChild(el);
}

/**
 * Mount the legend into a map container.
 *
 * Returns a handle even when there is no DOM (server render, node tests), in
 * which case every method is a no-op — the renderer must not care.
 *
 * @param {HTMLElement|null} container
 * @returns {{ update: (visible: Iterable<string>) => void,
 *             isOpen: () => boolean,
 *             destroy: () => void,
 *             element: HTMLElement|null }}
 */
const LEGEND_BUBBLE_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h10M4 18h7"/><circle cx="18" cy="12" r="2"/><circle cx="15" cy="18" r="2"/></svg>';

export function createMapLegend(container, options = {}) {
  const doc = container && container.ownerDocument;
  if (!container || !doc || typeof doc.createElement !== "function") {
    return { update() {}, isOpen: () => false, destroy() {}, element: null };
  }

  ensureStyles(doc);

  const bubble = options.chrome === "bubble";
  const root = doc.createElement("div");
  root.className = bubble
    ? `${LEGEND_ROOT_CLASS} ${LEGEND_ROOT_CLASS}--bubble`
    : LEGEND_ROOT_CLASS;
  root.hidden = true;

  const toggle = doc.createElement("button");
  toggle.type = "button";
  toggle.className = `${LEGEND_ROOT_CLASS}__toggle`;
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "Legend");
  if (bubble) toggle.innerHTML = LEGEND_BUBBLE_SVG;
  else toggle.textContent = "Legend";

  const panel = doc.createElement("div");
  panel.className = `${LEGEND_ROOT_CLASS}__panel`;
  panel.hidden = true;

  let open = false;
  const onToggle = () => {
    open = !open;
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  };
  toggle.addEventListener("click", onToggle);

  root.appendChild(toggle);
  root.appendChild(panel);
  container.appendChild(root);

  return {
    element: root,
    isOpen: () => open,
    update(visibleLayers) {
      const sections = legendSectionsFor(visibleLayers);
      if (!sections.length) {
        root.hidden = true;
        panel.innerHTML = "";
        return;
      }
      root.hidden = false;
      panel.innerHTML = legendPanelHtml(sections);
      panel.hidden = !open;
    },
    destroy() {
      toggle.removeEventListener("click", onToggle);
      root.remove();
    },
  };
}
