"use client";

import { useActionState } from "react";
import { Button, FormMessage } from "@/components/ui";
import type { ActionState } from "@/lib/validation";

/** Wraps a server action: shows validation/server errors and a saved notice. */
export function ActionForm({
  action, children, submit = "Save", className, variant = "primary",
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  submit?: string;
  className?: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const messages = [state?.error, ...Object.values(state?.fieldErrors ?? {})].filter(Boolean).join(" · ");
  return (
    <form action={formAction} className={className ?? "space-y-4"}>
      <FormMessage error={messages || undefined} />
      {state?.ok && <p role="status" className="rounded border border-teal/30 bg-mint px-3 py-2 text-sm text-navy">Saved.</p>}
      {children}
      <Button type="submit" variant={variant} disabled={pending}>{pending ? "Working…" : submit}</Button>
    </form>
  );
}
