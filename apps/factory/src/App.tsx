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

type SessionState =
  | { kind: "loading" }
  | { kind: "signed-out"; authError: string | null }
  | { kind: "signed-in"; email: string | null; provider: string };

type ScreenRow = { name: string; state: string; note: string | null };

export function App() {
  const [screen, setScreen] = useState(loadPref);
  const [session, setSession] = useState<SessionState>({ kind: "loading" });
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
    fetch("/api/auth/session", { credentials: "same-origin" })
      .then(async (r) => {
        if (r.status === 401) {
          setSession({ kind: "signed-out", authError });
          return;
        }
        const body = await r.json();
        if (!body.authenticated) {
          setSession({ kind: "signed-out", authError });
          return;
        }
        setSession({ kind: "signed-in", email: body.email ?? null, provider: body.provider });
      })
      .catch(() => setSession({ kind: "signed-out", authError }));
  }, []);

  useEffect(() => {
    if (session.kind !== "signed-in") return;
    setError(null);
    const load = async () => {
      const [cRes, sRes, rRes] = await Promise.all([
        fetch(`${PROXY}/counts`, { credentials: "same-origin" }),
        fetch(`${PROXY}/screens`, { credentials: "same-origin" }),
        fetch(`${PROXY}/runs`, { credentials: "same-origin" }),
      ]);
      if (cRes.status === 401 || sRes.status === 401 || rRes.status === 401) {
        setSession({ kind: "signed-out", authError: null });
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
  }, [session.kind]);

  useEffect(() => {
    if (session.kind !== "signed-in") return;
    if (screen !== "Queues" && screen !== "Gates") {
      setExtra(null);
      return;
    }
    const path = screen === "Queues" ? "queues" : "gates";
    fetch(`${PROXY}/${path}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((body) => setExtra(body))
      .catch((e) => setError(String(e)));
  }, [session.kind, screen]);

  const title = useMemo(() => `Smart Site Factory — ${screen}`, [screen]);
  const current = screens.find((s) => s.name === screen);

  if (session.kind === "loading") {
    return (
      <div>
        <header>
          <h1>Smart Site Factory</h1>
        </header>
        <main>
          <p>Checking sign-in.</p>
        </main>
      </div>
    );
  }

  if (session.kind === "signed-out") {
    return (
      <div>
        <header>
          <h1>Smart Site Factory</h1>
          <p>Operator sign-in required. The console holds no Factory data of its own.</p>
        </header>
        <main>
          {session.authError ? <p>Sign-in refused: {session.authError}</p> : null}
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
          Signed in as {session.email ?? session.provider}. Reads the Factory store through the
          server-side proxy.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).then(() => {
              setSession({ kind: "signed-out", authError: null });
              setCounts(null);
              setScreens([]);
              setRuns(null);
              setExtra(null);
            });
          }}
        >
          <button type="submit">Sign out</button>
        </form>
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
