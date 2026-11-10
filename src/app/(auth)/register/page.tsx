"use client";

import Link from "next/link";
import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { registerAction } from "../actions";
import { Button, Field, FormMessage, Input, Select } from "@/components/ui";
import { ORG_TYPES } from "@/lib/validation";

function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, undefined);
  const e = state?.fieldErrors ?? {};
  const next = useSearchParams().get("next") ?? "";
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <h1 className="text-xl font-semibold">Create your Mediverse account</h1>
      <FormMessage error={state?.error} />
      <Field label="Full name" error={e.fullName}><Input name="fullName" autoComplete="name" required /></Field>
      <Field label="Work email" error={e.email}><Input name="email" type="email" autoComplete="email" required /></Field>
      <Field label="Password" error={e.password} hint="At least 10 characters with upper case, lower case and a number.">
        <Input name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="Organization name" error={e.orgName}><Input name="orgName" autoComplete="organization" required /></Field>
      <Field label="Organization type" error={e.orgType}>
        <Select name="orgType" defaultValue="" required>
          <option value="" disabled>Select a type</option>
          {ORG_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </Field>
      <Field label="Country" error={e.country}><Input name="country" autoComplete="country-name" required /></Field>
      <Field label="Phone (optional)" error={e.phone}><Input name="phone" type="tel" autoComplete="tel" /></Field>
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Creating account…" : "Create account"}</Button>
      <p className="text-center text-sm text-slate-600">Already have an account? <Link href="/login" className="font-medium text-teal-600 hover:underline">Sign in</Link></p>
    </form>
  );
}

export default function RegisterPage() {
  return <Suspense><RegisterForm /></Suspense>;
}
