/** Left rail — files and artifacts browser + dynamic operator sections (Tools, Atoms, Runs). */

import { listArtifactFiles } from "../api/spine-api.js";

const SECTION_IDS = ["tools", "atoms", "runs"];

/**
 * @param {HTMLElement} container
 * @param {{ onSelect?: (meta: object) => void }} [opts]
 */
export function renderFilesRail(container, { onSelect } = {}) {
  const files = listArtifactFiles();
  container.innerHTML = `
    <header class="rail-head">Files / artifacts</header>
    <ul class="file-list" role="list">
      ${files
        .map(
          (f) =>
            `<li><button type="button" class="file-item" data-path="${f.path}">` +
            `<span class="file-kind">${f.kind}</span>` +
            `<span class="file-label">${f.label}</span>` +
            `<code class="file-path">${f.path}</code>` +
            `</button></li>`,
        )
        .join("")}
    </ul>
    ${SECTION_IDS.map(
      (id) =>
        `<section class="rail-section" id="rail-section-${id}">` +
        `<header class="rail-subhead">${id.charAt(0).toUpperCase() + id.slice(1)}</header>` +
        `<div class="rail-section-body" id="rail-body-${id}"><p class="muted">—</p></div>` +
        `</section>`,
    ).join("")}
    <section class="rail-section">
      <header class="rail-subhead">Inspect</header>
      <pre class="inspect-pane" id="file-inspect">Select an artifact</pre>
    </section>
  `;

  const inspect = container.querySelector("#file-inspect");
  container.querySelectorAll(".file-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const path = btn.dataset.path;
      const meta = files.find((f) => f.path === path);
      inspect.textContent = JSON.stringify(meta, null, 2);
      onSelect?.(meta);
    });
  });
}

/** Update a dynamic left-rail section (tools | atoms | runs). */
export function updateFilesRailSection(sectionId, html) {
  const el = document.getElementById(`rail-body-${sectionId}`);
  if (el) el.innerHTML = html;
}
