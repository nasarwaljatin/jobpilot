"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, signup } from "@/app/actions";
import { FormMessage, SubmitButton } from "./forms";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [state, action] = useActionState(mode === "login" ? login : signup, undefined);
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <Link href="/" className="mb-8 text-lg font-semibold tracking-tight">JobPilot</Link>
      <form action={action} className="card space-y-4 p-6">
        <h1 className="text-xl font-semibold">{mode === "login" ? "Log in" : "Create your account"}</h1>
        {mode === "signup" && (
          <div>
            <label className="label" htmlFor="name">Full name</label>
            <input id="name" name="name" className="input" autoComplete="name" required />
          </div>
        )}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="input" autoComplete="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            className="input"
            minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
          />
        </div>
        <FormMessage state={state} />
        <SubmitButton pendingText="Please wait…">{mode === "login" ? "Log in" : "Sign up"}</SubmitButton>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        {mode === "login" ? (
          <>No account? <Link className="text-accent" href="/signup">Sign up</Link></>
        ) : (
          <>Already have an account? <Link className="text-accent" href="/login">Log in</Link></>
        )}
      </p>
    </main>
  );
}
