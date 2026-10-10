import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  lazy,
  Suspense,
  type FormEvent,
} from "react";
import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import type { Brain } from "../../../packages/core/src/schemas.js";
import { OAuthConsent, OAuthConnections } from "./OAuth.js";
import { usernameAddress } from "./username.js";
import { apiClient } from "./api.js";
const Workspace = lazy(() =>
  import("./Workspace.js").then((module) => ({ default: module.Workspace })),
);
function Logo() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        ✳
      </span>
      <div>
        Mio <strong>Hivemind</strong>
        <small>SHARED PROJECT MEMORY</small>
      </div>
    </div>
  );
}
function Login({
  client,
  error: setupError,
  signup = false,
}: {
  client: SupabaseClient | null;
  error: string;
  signup?: boolean;
}) {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [registering, setRegistering] = useState(signup);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!client) return;
    setBusy(true);
    setError("");
    try {
      const email = usernameAddress(username);
      if (registering && password !== confirmation) {
        setError("Passwords do not match.");
        return;
      }
      if (registering) {
        const { data, error } = await client.auth.signUp({
          email,
          password,
        });
        if (error) setError(error.message);
        else if (!data.session) {
          setError(
            "Account created, but sign-in is unavailable. Please contact the administrator.",
          );
        }
      } else {
        const { error } = await client.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          setError("Sign-in failed. Check your username and password.");
        }
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Authentication service is unavailable.",
      );
    } finally {
      setPassword("");
      setConfirmation("");
      setBusy(false);
    }
  }
  return (
    <main className="login-layout">
      <section className="login-story">
        <Logo />
        <div className="hero-copy">
          <span className="eyebrow">CONTEXT THAT STAYS WITH THE PROJECT</span>
          <h1>
            Many assistants.
            <br />
            One shared
            <br />
            <em>understanding.</em>
          </h1>
          <p>
            Your studio’s architecture, decisions and discoveries — available
            wherever development happens.
          </p>
          <div className="brain-illustration" aria-hidden="true">
            <div className="orbit">
              <span>Cursor</span>
              <span>Claude Code</span>
              <span>VS Code</span>
            </div>
            <div className="brain-core">
              ✳<small>PROJECT BRAIN</small>
            </div>
            <div className="orbit lower">
              <span>Decisions</span>
              <span>Handoffs</span>
              <span>Discoveries</span>
            </div>
          </div>
        </div>
        <div className="privacy-foot">
          ◈ Project knowledge only. Private by default.
        </div>
      </section>
      <section className="login-form">
        <div className="eyebrow">MIO STUDIOS</div>
        <h2>{registering ? "Create your account" : "Welcome to Hivemind"}</h2>
        <p className="muted">
          {registering
            ? "Your own sign-in for shared project memory."
            : "Sign in to your project brains."}
        </p>
        {setupError ? (
          <div className="error" role="alert">
            {setupError}
          </div>
        ) : null}
        <form onSubmit={submit}>
          <label>
            Username
            <input
              required
              type="text"
              minLength={3}
              maxLength={32}
              pattern="[A-Za-z0-9_]{3,32}"
              autoCapitalize="none"
              spellCheck={false}
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your_username"
            />
          </label>
          <label>
            Password
            <input
              required
              type="password"
              autoComplete={registering ? "new-password" : "current-password"}
              minLength={registering ? 10 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {registering ? (
            <>
              <p className="muted">Use at least 10 characters.</p>
              <label>
                Confirm password
                <input
                  required
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </label>
            </>
          ) : null}
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="primary" disabled={!client || busy}>
            {busy
              ? "Please wait…"
              : registering
                ? "Create account →"
                : "Sign in →"}
          </button>
        </form>
        <p>
          {registering ? "Already have an account? " : "New to Hivemind? "}
          {window.location.pathname === "/oauth/consent" ? (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setRegistering(!registering);
                setError("");
              }}
            >
              {registering ? "Sign in" : "Create an account"}
            </button>
          ) : (
            <a href={registering ? "/login" : "/signup"}>
              {registering ? "Sign in" : "Create an account"}
            </a>
          )}
        </p>
        <p className="login-note">
          Your email is used by Supabase Auth. Existing project brains require
          an invitation from a brain administrator.
        </p>
      </section>
    </main>
  );
}
export function App() {
  const [client, setClient] = useState<SupabaseClient | null>(null),
    [session, setSession] = useState<Session | null>(null),
    [setupError, setSetupError] = useState("");
  useEffect(() => {
    let active = true;
    let unsubscribe: undefined | (() => void);
    void fetch("/api/config")
      .then((r) => r.json())
      .then((c: { supabaseUrl?: string; supabasePublishableKey?: string }) => {
        if (!active) return;
        if (!c.supabaseUrl || !c.supabasePublishableKey) {
          setSetupError(
            "Configure Supabase in the server environment, then restart the server. See the local setup in README.",
          );
          return;
        }
        const db = createClient(c.supabaseUrl, c.supabasePublishableKey, {
          auth: { persistSession: true, autoRefreshToken: true },
        });
        setClient(db);
        const { data } = db.auth.onAuthStateChange((_event, s) => {
          if (active) {
            setSession(s);
            if (s && ["/signup", "/login"].includes(window.location.pathname))
              window.history.replaceState(null, "", "/");
          }
        });
        unsubscribe = () => data.subscription.unsubscribe();
        void db.auth.getSession().then(({ data }) => {
          if (active) setSession(data.session);
        });
      })
      .catch(() => {
        if (active)
          setSetupError(
            "The Hivemind server is unavailable. Start the server and reload this page.",
          );
      });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);
  if (!session || !client)
    return (
      <Login
        client={client}
        error={setupError}
        signup={window.location.pathname === "/signup"}
      />
    );
  const signOut = () => {
    void client.auth.signOut({ scope: "local" }).then(() => setSession(null));
  };
  if (window.location.pathname === "/oauth/consent")
    return <OAuthConsent client={client} onSignOut={signOut} />;
  if (window.location.pathname === "/connections")
    return (
      <main className="workspace-content">
        <OAuthConnections client={client} />
      </main>
    );
  return (
    <Studio
      key={session.user.id}
      session={session}
      onSignOut={() => {
        void client.auth.signOut().then(() => setSession(null));
      }}
    />
  );
}
function Studio({
  session,
  onSignOut,
}: {
  session: Session;
  onSignOut: () => void;
}) {
  const api = useMemo(
    () => apiClient(session.access_token),
    [session.access_token],
  );
  const [brains, setBrains] = useState<Brain[]>([]),
    [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [creating, setCreating] = useState(false);
  const [name, setName] = useState(""),
    [overview, setOverview] = useState(""),
    [global, setGlobal] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const data = await api<{ brains: Brain[] }>("/brains");
      setBrains(data.brains);
      setSelected((current) =>
        data.brains.some((b) => b.id === current)
          ? current
          : (data.brains[0]?.id ?? ""),
      );
    } catch (e) {
      setBrains([]);
      setSelected("");
      setError(e instanceof Error ? e.message : "Unable to load brains.");
    }
  }, [api]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      const result = await api<{ id: string }>("/actions", {
        action: "create_brain",
        payload: { name, overview, is_global: global },
      });
      setCreating(false);
      setName("");
      setOverview("");
      await refresh();
      setSelected(result.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create brain.");
    }
  }
  const brain = brains.find((b) => b.id === selected);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Logo />
        <div className="studio-label">
          <span className="studio-avatar">M</span>
          <div>
            Mio Studios<small>Project workspace</small>
          </div>
        </div>
        <div className="sidebar-heading">
          YOUR BRAINS
          <button
            className="text-button"
            aria-label="Create brain"
            onClick={() => setCreating(true)}
          >
            +
          </button>
        </div>
        <nav aria-label="Project brains">
          {brains.map((b) => (
            <button
              key={b.id}
              className={`brain-nav ${selected === b.id ? "selected" : ""}`}
              onClick={() => setSelected(b.id)}
            >
              <span aria-hidden="true">{b.is_global ? "◈" : "◇"}</span>
              <span>{b.name}</span>
            </button>
          ))}
        </nav>
        <button className="new-brain" onClick={() => setCreating(true)}>
          + Create brain
        </button>
        <div className="sidebar-bottom">
          <div className="privacy-label">◈ Project-only memory</div>
          <p>
            Each brain is isolated.
            <br />
            Access is always explicit.
          </p>
          <a href="/connections">Connected assistants</a>
          <button className="text-button" onClick={onSignOut}>
            Sign out ↗
          </button>
        </div>
      </aside>
      <main className="main-area">
        <div className="topbar">
          <span>
            Workspace <span className="muted">/</span> {brain?.name ?? "Brains"}
          </span>
          <span className="badge">{session.user.id.slice(0, 8)}</span>
        </div>
        <div className="workspace-content">
          {error ? (
            <p className="error" role="alert">
              {error}
              <button onClick={() => setError("")}>Dismiss</button>
            </p>
          ) : null}
          {creating ? (
            <section className="panel">
              <div className="section-heading">
                <h2>Create a brain</h2>
                <button onClick={() => setCreating(false)}>Cancel</button>
              </div>
              <form onSubmit={create}>
                <label>
                  Project name
                  <input
                    required
                    minLength={3}
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Onion’s Adventure"
                    autoFocus
                  />
                </label>
                <label>
                  Project overview
                  <textarea
                    rows={3}
                    maxLength={1000}
                    value={overview}
                    onChange={(e) => setOverview(e.target.value)}
                    placeholder="A Roblox adventure game with server-authoritative inventory."
                  />
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={global}
                    onChange={(e) => setGlobal(e.target.checked)}
                  />
                  Studio Global brain (explicit membership still required)
                </label>
                <button className="primary">Create brain</button>
              </form>
            </section>
          ) : null}
          {brain ? (
            <Suspense fallback={<p role="status">Loading brain…</p>}>
              <Workspace
                key={brain.id}
                brain={brain}
                actorId={session.user.id}
                api={api}
                onDeleted={() => void refresh()}
              />
            </Suspense>
          ) : (
            <div className="welcome-empty">
              <span className="brand-mark">✳</span>
              <div className="eyebrow">YOUR STUDIO’S SHARED KNOWLEDGE</div>
              <h1>Start with a project brain.</h1>
              <p>
                Create an isolated space for architecture, discoveries and
                session handoffs. Invite your team when you’re ready.
              </p>
              <button className="primary" onClick={() => setCreating(true)}>
                Create your first brain →
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
