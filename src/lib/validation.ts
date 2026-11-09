import { z } from "zod";

export const ORG_TYPES = [
  ["hospital", "Hospital"],
  ["pharmacy", "Pharmacy"],
  ["medical_laboratory", "Medical laboratory"],
  ["clinic", "Clinic"],
  ["healthcare_network", "Healthcare network"],
  ["medical_distributor", "Medical distributor"],
  ["other", "Other"],
] as const;

const orgTypeValues = ORG_TYPES.map((t) => t[0]) as [string, ...string[]];

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a number");

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid work email"),
  password: passwordSchema,
  orgName: z.string().trim().min(2, "Enter your organization name").max(120),
  orgType: z.enum(orgTypeValues, { message: "Choose an organization type" }),
  country: z.string().trim().min(2, "Enter your country").max(80),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export const orgSchema = z.object({
  name: z.string().trim().min(2, "Enter an organization name").max(120),
  type: z.enum(orgTypeValues),
  country: z.string().trim().max(80).optional().or(z.literal("")),
});

export const locationSchema = z.object({
  name: z.string().trim().min(1, "Enter a location name").max(120),
  kind: z.string().trim().max(40).default("facility"),
  address: z.string().trim().max(300).optional().or(z.literal("")),
});

export const alertSettingsSchema = z.object({
  expiryWarningDays: z.coerce.number().int().min(1).max(365),
  unusualFactor: z.coerce.number().min(1).max(10),
});

export type ActionState = { error?: string; fieldErrors?: Record<string, string>; ok?: boolean } | undefined;

export function zodFieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const k = String(issue.path[0] ?? "form");
    if (!out[k]) out[k] = issue.message;
  }
  return out;
}
