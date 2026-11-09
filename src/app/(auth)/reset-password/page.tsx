"use client";

import { useActionState } from "react";
import { resetPasswordAction } from "../actions";
import { Button, Field, FormMessage, Input } from "@/components/ui";

export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState(resetPasswordAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      <FormMessage error={state?.error} />
      <Field label="New password" error={state?.fieldErrors?.password} hint="At least 10 characters with upper case, lower case and a number.">
        <Input name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm password" error={state?.fieldErrors?.confirm}>
        <Input name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Saving…" : "Update password"}</Button>
    </form>
  );
}
