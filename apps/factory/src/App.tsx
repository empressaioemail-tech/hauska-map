import { useEffect, useMemo, useState } from "react";
import { SCREENS, VIEW_PREF_KEY } from "./screens.mjs";

const PROXY = "/api/proxy";

function loadPref(): string {
  try {
    return localStorage.getItem(VIEW_PREF_KEY) ?? "States";
  } catch {
    return "States";
  }
}

type Gate =
  | { kind: "loading" }
  | { kind: "open"; email: string | null }
  | { kind: "sign-in"; authError: string | null };

type ScreenRow = { name: string; state: string; note: string | null };

export function App() {
  const [screen, setScreen] = useState(loadPref);
  const [gate, setGate] = useState<Gate>({ kind: "loading" });
  const [counts, setCounts] = useState<Record<string, unknown> | null>(null);
  const [screens, setScreens] = useState<ScreenRow[]>([]);
  const [runs, setRuns] = useState<unknown[] | null>(null);
  const [extra, setExtra] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_PREF_KEY, screen);
    } catch {
      /* view preference only */
    }
  }, [screen]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error");
    const open = () => setGate({ kind: "open", email: null });
    fetch("/api/auth/status", { credentials: "same-origin" })
      .then(async (r) => {
        const status = await r.json();
        if (status.authRequired === false) {
          open();
          return;
        }
        const sessionRes = await fetch("/api/auth/session", { credentials: "same-origin" });
        if (sessionRes.status === 401) {
          setGate({ kind: "sign-in", authError });
          return;
        }
        const session = await sessionRes.json();
        if (!session.authenticated) {
          setGate({ kind: "sign-in", authError });
          return;
        }
        setGate({ kind: "open", email: session.email ?? null });
      })
      .catch(() => setGate({ kind: "sign-in", authError }));
  }, []);

  useEffect(() => {
    if (gate.kind !== "open") return;
    setError(null);
    const load = async () => {
      const [cRes, sRes, rRes] = await Promise.all([
        fetch(`${PROXY}/counts`, { credentials: "same-origin" }),
        fetch(`${PROXY}/screens`, { credentials: "same-origin" }),
        fetch(`${PROXY}/runs`, { credentials: "same-origin" }),
      ]);
      if (cRes.status === 401 || sRes.status === 401 || rRes.status === 401) {
        setGate({ kind: "sign-in", authError: null });
        return;
      }
      const c = await cRes.json();
      const s = await sRes.json();
      const r = await rRes.json();
      setCounts(c);
      setScreens(s.screens ?? []);
      setRuns(Array.isArray(r.runs) ? r.runs : []);
    };
    load().catch((e) => setError(String(e)));
  }, [gate.kind]);

  useEffect(() => {
    if (gate.kind !== "open") return;
    if (screen !== "Queues" && screen !== "Gates") {
      setExtra(null);
      return;
    }
    const path = screen === "Queues" ? "queues" : "gates";
    fetch(`${PROXY}/${path}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((body) => setExtra(body))
      .catch((e) => setError(String(e)));
  }, [gate.kind, screen]);

  const title = useMemo(() => `Smart Site Factory — ${screen}`, [screen]);
  const current = screens.find((s) => s.name === screen);

  if (gate.kind === "loading") {
    return (
      <div>
        <header>
          <h1>Smart Site Factory</h1>
        </header>
        <main>
          <p>Loading the Factory console.</p>
        </main>
      </div>
    );
  }

  if (gate.kind === "sign-in") {
    return (
      <div>
        <header>
          <h1>Smart Site Factory</h1>
          <p>Operator sign-in required. The console holds no Factory data of its own.</p>
        </header>
        <main>
          {gate.authError ? <p>Sign-in refused: {gate.authError}</p> : null}
          <p>
            <a href="/api/auth/google/start">Sign in with Google</a>
          </p>
          <p>
            <a href="/api/auth/microsoft/start">Sign in with Microsoft</a>
          </p>
        </main>
      </div>
    );
  }

  return (
    <div>
      <header>
        <h1>{title}</h1>
        <p>
          {gate.email
            ? `Signed in as ${gate.email}. Reads the Factory store through the server-side proxy.`
            : "Reads the Factory store through the server-side proxy."}
        </p>
      </header>
      <nav>
        {SCREENS.map((s) => (
          <button key={s} type="button" onClick={() => setScreen(s)}>
            {s}
          </button>
        ))}
      </nav>
      <main>
        {error ? <p>{error}</p> : null}
        {current ? (
          <p>
            {current.state === "not-built"
              ? `Honest empty: ${current.note}`
              : `${current.name} is ready.`}
          </p>
        ) : null}
        {screen === "Runs" ? (
          <pre>{runs ? JSON.stringify(runs, null, 2) : "waiting on runs"}</pre>
        ) : extra ? (
          <pre>{JSON.stringify(extra, null, 2)}</pre>
        ) : (
          <pre>{counts ? JSON.stringify(counts, null, 2) : "waiting on control API"}</pre>
        )}
      </main>
    </div>
  );
}
