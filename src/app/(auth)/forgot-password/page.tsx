"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction } from "../actions";
import { Button, Field, Input } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(forgotPasswordAction, undefined);
  if (state?.ok) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="text-sm text-slate-600">If an account exists for that address, we have sent a link to reset your password.</p>
        <Link href="/login" className="text-sm font-medium text-teal-600 hover:underline">Back to sign in</Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-xl font-semibold">Reset your password</h1>
      <p className="text-sm text-slate-600">Enter your work email and we will send you a reset link.</p>
      <Field label="Work email" error={state?.fieldErrors?.email}><Input name="email" type="email" required /></Field>
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</Button>
      <Link href="/login" className="block text-center text-sm text-teal-600 hover:underline">Back to sign in</Link>
    </form>
  );
}
