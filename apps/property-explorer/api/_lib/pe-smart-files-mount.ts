/**
 * Smart Files mount config for Property Explorer (G-58 item 8).
 * PE is a consumer. It may know the files service URL. It must not hold a files DSN.
 */

const FILES_DSN_NAME =
  /^(SMART_FILES_.*DATABASE.*|FILES_DATABASE_URL|SMART_FILES_DATABASE_URL)$/i;

export function filesDsnKeysPresent(env: NodeJS.ProcessEnv): string[] {
  return Object.keys(env).filter((k) => FILES_DSN_NAME.test(k));
}

export function resolveFilesMount(env: NodeJS.ProcessEnv): {
  backendUrl: string;
  apiKey: string;
} {
  const dsnKeys = filesDsnKeysPresent(env);
  if (dsnKeys.length > 0) {
    throw new Error(
      `PE must not hold a files DSN (found ${dsnKeys.join(", ")}). Mount the HTTP service only.`,
    );
  }
  const backendUrl = (env.SMART_FILES_BACKEND_URL ?? "").replace(/\/$/, "");
  if (!backendUrl) {
    throw new Error("SMART_FILES_BACKEND_URL is required");
  }
  if (/cortex-api/i.test(backendUrl)) {
    throw new Error("SMART_FILES_BACKEND_URL refuses cortex-api");
  }
  if (/neon\.tech|snowy-bread|winter-shape|fancy-fire|lucky-truth/i.test(backendUrl)) {
    throw new Error("SMART_FILES_BACKEND_URL refuses a database host");
  }
  const apiKey = env.SMART_FILES_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("SMART_FILES_API_KEY is required");
  }
  return { backendUrl, apiKey };
}

export const ISOLATION_PROBE = {
  scopeType: "tenant" as const,
  scopeId: "g58-probe",
};
