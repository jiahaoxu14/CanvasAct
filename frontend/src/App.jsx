import { useEffect, useState } from "react";

export default function App() {
  const [health, setHealth] = useState({
    loading: true,
    status: "checking",
    message: "Contacting backend...",
  });

  useEffect(() => {
    let active = true;

    async function loadHealth() {
      try {
        const response = await fetch("/api/health");
        if (!response.ok) {
          throw new Error(`Request failed with ${response.status}`);
        }

        const data = await response.json();
        if (!active) {
          return;
        }

        setHealth({
          loading: false,
          status: data.status,
          message: data.message,
        });
      } catch (error) {
        if (!active) {
          return;
        }

        setHealth({
          loading: false,
          status: "error",
          message: error.message,
        });
      }
    }

    loadHealth();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">CanvasAct</p>
        <h1>React frontend, Flask backend.</h1>
        <p className="lede">
          The frontend is served by Vite and the backend exposes a starter API
          at <code>/api/health</code>.
        </p>
      </section>

      <section className="status-card" aria-live="polite">
        <span className={`badge badge-${health.status}`}>
          {health.loading ? "loading" : health.status}
        </span>
        <h2>Backend status</h2>
        <p>{health.message}</p>
      </section>
    </main>
  );
}
