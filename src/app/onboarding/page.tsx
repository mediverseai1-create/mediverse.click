import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/org";
import { AlertsForm, ItemForm, LocationForm, OrgForm } from "./forms";

const STEPS = [
  { key: "org", title: "Organization profile", text: "Confirm the details of your organization." },
  { key: "location", title: "First location", text: "Add the facility, branch or warehouse where stock is kept." },
  { key: "items", title: "Add inventory", text: "Add a first product now, or import a spreadsheet from the Inventory page later." },
  { key: "alerts", title: "Stock alerts", text: "Choose when Mediverse should warn you." },
] as const;

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const { step: stepParam } = await searchParams;
  const ctx = await getOrgContext();
  if (ctx?.onboardingCompleted) redirect("/dashboard");

  type StepKey = (typeof STEPS)[number]["key"];
  let step = "org" as StepKey;
  if (ctx) {
    const valid = STEPS.some((s) => s.key === stepParam);
    step = valid && stepParam !== "org" ? (stepParam as StepKey) : "location";
  }

  let defaults = { name: "", type: "other", country: "" };
  if (!ctx) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: p } = await supabase.from("profiles").select("signup_org_name, signup_org_type, country").eq("id", user!.id).maybeSingle();
    defaults = { name: p?.signup_org_name ?? "", type: p?.signup_org_type ?? "other", country: p?.country ?? "" };
  }

  const idx = STEPS.findIndex((s) => s.key === step);
  const current = STEPS[idx];

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Logo className="mb-8" />
      <ol className="mb-6 flex gap-2" aria-label="Setup progress">
        {STEPS.map((s, i) => (
          <li key={s.key} className={`h-1.5 flex-1 rounded ${i <= idx ? "bg-teal" : "bg-slate-200"}`} aria-current={i === idx ? "step" : undefined} />
        ))}
      </ol>
      <p className="text-sm text-slate-500">Step {idx + 1} of {STEPS.length}</p>
      <h1 className="mt-1 text-2xl font-semibold">{current.title}</h1>
      <p className="mb-6 mt-1 text-slate-600">{current.text}</p>
      <Card>
        {step === "org" && <OrgForm defaults={defaults} />}
        {step === "location" && <LocationForm />}
        {step === "items" && (
          <div className="space-y-4">
            <ItemForm />
            <Link href="/onboarding?step=alerts" className="inline-block text-sm text-teal-600 hover:underline">Skip for now</Link>
          </div>
        )}
        {step === "alerts" && <AlertsForm />}
      </Card>
    </main>
  );
}
