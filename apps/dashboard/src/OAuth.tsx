import { useEffect, useState } from "react";
import type {
  SupabaseClient,
  OAuthAuthorizationDetails,
  OAuthGrant,
} from "@supabase/supabase-js";

export function safeOAuthRedirect(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  )
    throw new Error("The client callback URL is not secure.");
  if (url.username || url.password)
    throw new Error("Invalid client callback URL.");
  return url.href;
}
export function OAuthConsent({
  client,
  onSignOut,
}: {
  client: SupabaseClient;
  onSignOut: () => void;
}) {
  const id = new URLSearchParams(window.location.search).get(
    "authorization_id",
  );
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(
    null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    if (!id || !/^[a-zA-Z0-9_-]{1,256}$/.test(id)) {
      setError(
        "Invalid authorization request. Start the connection again in your assistant.",
      );
      return;
    }
    void client.auth.oauth
      .getAuthorizationDetails(id)
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data) {
          setError(
            "This authorization request expired or is unavailable. Start the connection again in your assistant.",
          );
          return;
        }
        if ("redirect_url" in data)
          window.location.assign(safeOAuthRedirect(data.redirect_url));
        else setDetails(data);
      })
      .catch(() => {
        if (active) setError("Unable to load the authorization request.");
      });
    return () => {
      active = false;
    };
  }, [client, id]);
  async function decide(approve: boolean) {
    if (!id || !details || busy) return;
    setBusy(true);
    setError("");
    try {
      const { data, error } = approve
        ? await client.auth.oauth.approveAuthorization(id, {
            skipBrowserRedirect: true,
          })
        : await client.auth.oauth.denyAuthorization(id, {
            skipBrowserRedirect: true,
          });
      if (error || !data)
        throw new Error(
          "Could not submit your decision. Start the connection again in your assistant.",
        );
      window.location.assign(safeOAuthRedirect(data.redirect_url));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authorization failed.");
      setBusy(false);
    }
  }
  return (
    <main className="workspace-content">
      <section className="panel">
        <div className="eyebrow">MIO HIVEMIND</div>
        <h1>Connect your assistant</h1>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        {!details && !error ? <p role="status">Loading request…</p> : null}
        {details ? (
          <>
            <h2>{details.client.name || "Unnamed client"} requests access</h2>
            <p>
              Allow this client to read and update the project brains you belong
              to, including project memories and handoffs. Your existing role
              and membership restrictions apply. It cannot access other users’
              brains.
            </p>
            <p>
              Client ID: <code>{details.client.id}</code>
            </p>
            <p>
              Requested scopes: <code>{details.scope || "Default access"}</code>
            </p>
            <p>
              Callback: <code>{details.redirect_uri}</code>
            </p>
            <p>
              Only approve a connection you started in an assistant you trust.
              You can revoke it later under Connected assistants.
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void decide(true)}
            >
              Allow access
            </button>{" "}
            <button disabled={busy} onClick={() => void decide(false)}>
              Deny
            </button>
          </>
        ) : null}
        <p>
          <button className="text-button" onClick={onSignOut}>
            Sign out and use another account
          </button>
        </p>
      </section>
    </main>
  );
}
export function OAuthConnections({ client }: { client: SupabaseClient }) {
  const [grants, setGrants] = useState<OAuthGrant[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  useEffect(() => {
    let active = true;
    void client.auth.oauth
      .listGrants()
      .then(({ data, error }) => {
        if (active) {
          if (error) setError("Unable to load connected assistants.");
          else setGrants(data ?? []);
        }
      })
      .catch(() => {
        if (active) setError("Unable to load connected assistants.");
      });
    return () => {
      active = false;
    };
  }, [client]);
  async function revoke(id: string) {
    setBusy(id);
    setError("");
    try {
      const { error } = await client.auth.oauth.revokeGrant({ clientId: id });
      if (error) throw error;
      setGrants((old) => old.filter((g) => g.client.id !== id));
    } catch {
      setError("Could not revoke this connection. Try again.");
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="panel">
      <h1>Connected assistants</h1>
      <p>
        Revoking an assistant stops its MCP access and prevents it from
        refreshing its tokens.
      </p>
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : null}
      {grants.length ? (
        grants.map((g) => (
          <div key={g.client.id}>
            <h2>{g.client.name || "Unnamed client"}</h2>
            <p>
              <code>{g.client.id}</code> · {g.scopes.join(", ")}
            </p>
            <button disabled={!!busy} onClick={() => void revoke(g.client.id)}>
              Revoke access
            </button>
          </div>
        ))
      ) : (
        <p>No connected assistants.</p>
      )}
      <a href="/">Return to your brains</a>
    </section>
  );
}
