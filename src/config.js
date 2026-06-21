/** Runtime config — override via localStorage or query params. */

const STORAGE_KEY = "hauska-spine-console-config";

const DEFAULTS = {
  /** Bastrop QA anchor — 205 Javelina Trl */
  defaultCenter: { latitude: 30.1109, longitude: -97.3153 },
  defaultAddress: "205 Javelina Trl, Bastrop TX 78602",
  cortexApiUrl: "https://cortex-api-tds7av26va-uc.a.run.app",
  mcpUrl: "http://127.0.0.1:3000/mcp",
  /** Use fixture GIS when true (Wave 1 default — no Cotality quota burn). */
  useFixture: true,
  hauskaKey: "",
  installId: "spine-console-local",
};

export function loadConfig() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    stored = {};
  }
  const params = new URLSearchParams(window.location.search);
  const useFixture =
    params.has("fixture") ? params.get("fixture") !== "0" : stored.useFixture ?? DEFAULTS.useFixture;

  return {
    ...DEFAULTS,
    ...stored,
    useFixture,
    cortexApiUrl: params.get("api") || stored.cortexApiUrl || DEFAULTS.cortexApiUrl,
    mcpUrl: params.get("mcp") || stored.mcpUrl || DEFAULTS.mcpUrl,
  };
}

export function saveConfig(patch) {
  const next = { ...loadConfig(), ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
