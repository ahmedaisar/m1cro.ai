"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;

    authClient.getSession()
      .then(({ data }) => {
        if (active && data?.user) router.replace("/");
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setCheckingSession(false);
      });

    return () => {
      active = false;
    };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || checkingSession) return;

    setBusy(true);
    setError("");

    try {
      const result = await authClient.signIn.email({
        email: email.trim().toLowerCase(),
        password,
      });

      if (result.error) {
        throw new Error(result.error.message ?? "Unable to sign in. Check your details and try again.");
      }

      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const formDisabled = busy || checkingSession;

  return (
    <main className="auth-page">
      <div className="auth-layout">
        <aside className="auth-aside" aria-label="About m1cro.ai">
          <Link className="brand auth-brand" href="/" aria-label="m1cro.ai home">
            <span className="brand-mark">m<span>·</span></span>
            <span>m1cro<span className="brand-dot">.ai</span></span>
          </Link>
          <div className="auth-aside-copy">
            <p className="eyebrow">YOUR AI ENGINEERING WORKSPACE</p>
            <h1>Build without<br /><span>the busywork.</span></h1>
            <p>Bring your projects, models and agent sessions together in one focused workspace.</p>
            <ul className="auth-benefits">
              <li><span aria-hidden="true">✓</span><span>One workspace for your projects and sessions</span></li>
              <li><span aria-hidden="true">✓</span><span>Connect the model provider you already use</span></li>
              <li><span aria-hidden="true">✓</span><span>Keep execution and approvals in your control</span></li>
            </ul>
          </div>
          <p className="auth-aside-foot">A clearer way to work with AI.</p>
        </aside>

        <section className="auth-content" aria-labelledby="login-heading">
          <div className="auth-card">
            <div className="auth-mobile-brand brand">
              <span className="brand-mark">m<span>·</span></span>
              <span>m1cro<span className="brand-dot">.ai</span></span>
            </div>
            <p className="eyebrow">WELCOME BACK</p>
            <h2 id="login-heading">Sign in to m1cro.ai</h2>
            <p className="auth-copy">Use your account details to continue to your workspace.</p>

            {checkingSession ? (
              <div className="auth-session-check" role="status">
                <span className="auth-spinner" aria-hidden="true" />
                Checking your session…
              </div>
            ) : (
              <form className="auth-form" onSubmit={submit} aria-busy={busy}>
                <div className="auth-field">
                  <label htmlFor="email">Email address</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="you@example.com"
                    required
                    value={email}
                    onChange={event => {
                      setEmail(event.target.value);
                      if (error) setError("");
                    }}
                    disabled={formDisabled}
                  />
                </div>

                <div className="auth-field">
                  <div className="auth-field-heading">
                    <label htmlFor="password">Password</label>
                  </div>
                  <div className="auth-password-wrap">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      required
                      value={password}
                      onChange={event => {
                        setPassword(event.target.value);
                        if (error) setError("");
                      }}
                      disabled={formDisabled}
                      aria-describedby={error ? "login-error" : undefined}
                    />
                    <button
                      className="auth-password-toggle"
                      type="button"
                      onClick={() => setShowPassword(value => !value)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      disabled={formDisabled}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                {error ? (
                  <p className="form-error auth-error" id="login-error" role="alert">
                    <span aria-hidden="true">!</span>{error}
                  </p>
                ) : null}

                <button className="primary-button auth-submit" type="submit" disabled={formDisabled}>
                  {busy ? <><span className="auth-spinner" aria-hidden="true" />Signing in…</> : "Sign in"}
                </button>
              </form>
            )}

            <p className="auth-switch">New to m1cro.ai? <Link href="/signup">Create an account</Link></p>
          </div>
          <p className="auth-content-foot">By continuing, you agree to use your workspace responsibly.</p>
        </section>
      </div>
    </main>
  );
}
