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
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signUp.email({ name, email, password });
      if (result.error) throw new Error(result.error.message ?? "Unable to create account");
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand"><span className="brand-mark">m<span>·</span></span><span>m1cro<span className="brand-dot">.ai</span></span></div>
        <p className="eyebrow">THE AI ENGINEERING WORKSPACE</p>
        <h1>Create your account.</h1>
        <p className="auth-copy">Start building with your own models, agents and execution environments.</p>
        <form onSubmit={submit}>
          <label htmlFor="name">Name</label>
          <input id="name" autoComplete="name" required value={name} onChange={event => setName(event.target.value)} />
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={event => setPassword(event.target.value)} />
          {error ? <p role="alert" className="auth-error">{error}</p> : null}
          <button type="submit" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
        </form>
        <p className="auth-copy">Already have an account? <Link href="/login">Sign in</Link></p>
      </section>
    </main>
  );
}
