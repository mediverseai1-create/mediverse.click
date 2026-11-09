"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { loginAction } from "../actions";
import { Button, Field, FormMessage, Input } from "@/components/ui";

function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  const params = useSearchParams();
  const linkError = params.get("error") === "link" ? "That link is invalid or has expired. Please try again." : undefined;
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-xl font-semibold">Sign in to Mediverse</h1>
      <FormMessage error={state?.error ?? linkError} />
      <input type="hidden" name="next" value={params.get("next") ?? "/dashboard"} />
      <Field label="Work email" error={state?.fieldErrors?.email}>
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" error={state?.fieldErrors?.password}>
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <div className="text-right text-sm"><Link href="/forgot-password" className="text-teal-600 hover:underline">Forgot password?</Link></div>
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>
      <p className="text-center text-sm text-slate-600">New to Mediverse? <Link href="/register" className="font-medium text-teal-600 hover:underline">Create an account</Link></p>
    </form>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
