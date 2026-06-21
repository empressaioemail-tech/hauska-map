/** Left rail — files and artifacts browser (E layout) */

import { listArtifactFiles } from "../api/spine-api.js";

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
