/** Auth key entry — enables live cortex-api + MCP introspection + atom trace. */

import { saveConfig, hasAuthKey } from "../config.js";

export function renderAuthBar(container, config, { onSave } = {}) {
  const keyed = hasAuthKey(config);
  container.innerHTML = `
    <div class="auth-bar ${keyed ? "auth-bar--ok" : "auth-bar--missing"}">
      <label class="auth-label" for="hauska-key-input">Hauska key</label>
      <input
        id="hauska-key-input"
        class="auth-input"
        type="password"
        autocomplete="off"
        placeholder="Bearer / X-Hauska-Key"
        value="${keyed ? "••••••••" : ""}"
      />
      <button type="button" class="auth-save" id="hauska-key-save">Save</button>
      <button type="button" class="auth-fixture" id="toggle-fixture">
        ${config.useFixture ? "fixture=1" : "fixture=0 live"}
      </button>
      <span class="auth-status">${keyed ? "key set" : "no key — live APIs blocked"}</span>
    </div>
  `;

  const input = container.querySelector("#hauska-key-input");
  container.querySelector("#hauska-key-save")?.addEventListener("click", () => {
    const val = input.value.trim();
    if (val && val !== "••••••••") {
      saveConfig({ hauskaKey: val, useFixture: false });
    } else if (!val) {
      saveConfig({ hauskaKey: "" });
    } else {
      saveConfig({ useFixture: false });
    }
    onSave?.();
  });

  container.querySelector("#toggle-fixture")?.addEventListener("click", () => {
    saveConfig({ useFixture: !config.useFixture });
    onSave?.();
  });
}
