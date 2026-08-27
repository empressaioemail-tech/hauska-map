import { useEffect, useMemo, useState } from "react";
import { SCREENS, VIEW_PREF_KEY } from "./screens.mjs";

const API = import.meta.env.VITE_FACTORY_CONTROL_API ?? "";

function loadPref(): string {
  try {
    return localStorage.getItem(VIEW_PREF_KEY) ?? "States";
  } catch {
    return "States";
  }
}

function headers(): HeadersInit {
  return {};
}

export function App() {
  const [screen, setScreen] = useState(loadPref);
  const [counts, setCounts] = useState<Record<string, unknown> | null>(null);
  const [screens, setScreens] = useState<Array<{ name: string; state: string; note: string | null }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_PREF_KEY, screen);
    } catch {
      /* view preference only */
    }
  }, [screen]);

  useEffect(() => {
    if (!API) {
      setError("VITE_FACTORY_CONTROL_API unset; console holds no store of its own.");
      return;
    }
    Promise.all([
      fetch(`${API}/counts`, { headers: headers() }).then((r) => r.json()),
      fetch(`${API}/screens`, { headers: headers() }).then((r) => r.json()),
    ])
      .then(([c, s]) => {
        setCounts(c);
        setScreens(s.screens ?? []);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const title = useMemo(() => `Smart Site Factory — ${screen}`, [screen]);
  const current = screens.find((s) => s.name === screen);

  return (
    <div>
      <header>
        <h1>{title}</h1>
        <p>Reads the Factory control API. Holds no state except the view preference.</p>
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
        <pre>{counts ? JSON.stringify(counts, null, 2) : "waiting on control API"}</pre>
      </main>
    </div>
  );
}
