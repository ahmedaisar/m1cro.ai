"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError("");

    try {
      const result = await authClient.signUp.email({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      });
      if (result.error) throw new Error(result.error.message ?? "Unable to create account");
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create account. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-layout">
        <aside className="auth-aside" aria-label="About m1cro.ai">
          <Link className="brand auth-brand" href="/login" aria-label="m1cro.ai sign in">
            <span className="brand-mark">m<span>·</span></span>
            <span>m1cro<span className="brand-dot">.ai</span></span>
          </Link>
          <div className="auth-aside-copy">
            <p className="eyebrow">A BETTER WAY TO BUILD</p>
            <h1>Your ideas.<br /><span>In motion.</span></h1>
            <p>Create a focused workspace for your projects, models and AI-powered engineering sessions.</p>
            <ul className="auth-benefits">
              <li><span aria-hidden="true">✓</span><span>Organise work into private projects</span></li>
              <li><span aria-hidden="true">✓</span><span>Bring your preferred model provider</span></li>
              <li><span aria-hidden="true">✓</span><span>Review tool activity and approvals</span></li>
            </ul>
          </div>
          <p className="auth-aside-foot">Start with one project. Build from there.</p>
        </aside>

        <section className="auth-content" aria-labelledby="signup-heading">
          <div className="auth-card">
            <div className="auth-mobile-brand brand">
              <span className="brand-mark">m<span>·</span></span>
              <span>m1cro<span className="brand-dot">.ai</span></span>
            </div>
            <p className="eyebrow">GET STARTED</p>
            <h2 id="signup-heading">Create your account</h2>
            <p className="auth-copy">Set up your account and start building in your workspace.</p>

            <form className="auth-form" onSubmit={submit} aria-busy={busy}>
              <div className="auth-field">
                <label htmlFor="name">Your name</label>
                <input
                  id="name"
                  name="name"
                  autoComplete="name"
                  placeholder="Your name"
                  required
                  maxLength={120}
                  value={name}
                  onChange={event => {
                    setName(event.target.value);
                    if (error) setError("");
                  }}
                  disabled={busy}
                />
              </div>
              <div className="auth-field">
                <label htmlFor="email">Email address</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="you@example.com"
                  required
                  value={email}
                  onChange={event => {
                    setEmail(event.target.value);
                    if (error) setError("");
                  }}
                  disabled={busy}
                />
              </div>
              <div className="auth-field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 12 characters"
                  minLength={12}
                  required
                  value={password}
                  onChange={event => {
                    setPassword(event.target.value);
                    if (error) setError("");
                  }}
                  disabled={busy}
                />
                <span className="auth-field-hint">Use at least 12 characters.</span>
              </div>

              {error ? <p className="form-error auth-error" role="alert"><span aria-hidden="true">!</span>{error}</p> : null}

              <button className="primary-button auth-submit" type="submit" disabled={busy}>
                {busy ? <><span className="auth-spinner" aria-hidden="true" />Creating account…</> : "Create account"}
              </button>
            </form>

            <p className="auth-switch">Already have an account? <Link href="/login">Sign in</Link></p>
          </div>
          <p className="auth-content-foot">Your workspace starts with your account.</p>
        </section>
      </div>
    </main>
  );
}
