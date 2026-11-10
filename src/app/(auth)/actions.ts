"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { APP_URL } from "@/lib/utils";
import {
  loginSchema, registerSchema, passwordSchema, zodFieldErrors, type ActionState,
} from "@/lib/validation";
import { z } from "zod";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

function safeNext(n: string) {
  return n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard";
}

export async function registerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = registerSchema.safeParse({
    fullName: str(fd, "fullName"), email: str(fd, "email"), password: str(fd, "password"),
    orgName: str(fd, "orgName"), orgType: str(fd, "orgType"), country: str(fd, "country"), phone: str(fd, "phone"),
  });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  const d = parsed.data;
  const rawNext = str(fd, "next");
  const next = /^\/invite\/[0-9a-f-]{36}$/i.test(rawNext) ? rawNext : "/onboarding";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: d.email,
    password: d.password,
    options: {
      emailRedirectTo: `${APP_URL}/auth/callback?next=${next}`,
      data: { full_name: d.fullName, org_name: d.orgName, org_type: d.orgType, country: d.country, phone: d.phone ?? "" },
    },
  });
  if (error) return { error: "We could not create your account. Please check your details and try again." };
  // If email confirmation is on, no session exists yet.
  if (!data.session) redirect("/verify-email?email=" + encodeURIComponent(d.email));
  redirect(next);
}

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({ email: str(fd, "email"), password: str(fd, "password") });
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.message.toLowerCase().includes("not confirmed")) return { error: "Please verify your email first. Check your inbox for the confirmation link." };
    return { error: "Incorrect email or password." };
  }
  redirect(safeNext(str(fd, "next")));
}

export async function forgotPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = z.string().trim().email().safeParse(str(fd, "email"));
  if (!parsed.success) return { fieldErrors: { email: "Enter a valid email" } };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: `${APP_URL}/auth/callback?next=/reset-password` });
  // Same response whether or not the account exists (prevents account enumeration).
  return { ok: true };
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const pw = passwordSchema.safeParse(str(fd, "password"));
  if (!pw.success) return { fieldErrors: { password: pw.error.issues[0].message } };
  if (str(fd, "password") !== str(fd, "confirm")) return { fieldErrors: { confirm: "Passwords do not match" } };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: pw.data });
  if (error) return { error: "Could not update your password. The reset link may have expired." };
  redirect("/dashboard");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
