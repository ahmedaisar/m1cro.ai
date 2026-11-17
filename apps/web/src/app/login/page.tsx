"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" }).then(async response => {
      const data = await response.json() as { authenticated?: boolean };
      if (data.authenticated) router.replace("/");
    }).catch(() => {});
    fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
      .then(response => setConfigured(response.status !== 503))
      .catch(() => setConfigured(false));
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to sign in");
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in");
    } finally { setBusy(false); }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand"><span className="brand-mark">m<span>·</span></span><span>m1cro<span className="brand-dot">.ai</span></span></div>
        <p className="eyebrow">PRIVATE ENGINEERING WORKSPACE</p>
        <h1>Welcome back.</h1>
        <p className="auth-copy">Sign in with your workspace account to continue your engineering sessions.</p>
        {configured === false && <div className="notice notice-warning">Web sign-in is not configured. Add M1CRO_USERS_JSON and a random M1CRO_WEB_SESSION_SECRET (32+ characters) to the server environment.</div>}
        <form onSubmit={submit} className="auth-form">
          <label htmlFor="email">Email address</label>
          <input id="email" type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required />
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button auth-submit" type="submit" disabled={busy || configured === false}>{busy ? "Signing in…" : "Continue"}</button>
        </form>
        <p className="auth-footnote">Individual account · Secure, HTTP-only session cookie</p>
      </section>
    </main>
  );
}
