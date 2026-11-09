import Link from "next/link";
import { Logo } from "@/components/logo";

// Temporary home; the full marketing site is built in Phase 3.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center gap-6 px-6">
      <Logo />
      <h1 className="text-4xl font-semibold tracking-tight">Your Medical Inventory. Under Control. Powered by Intelligence.</h1>
      <div className="flex gap-3">
        <Link href="/register" className="rounded bg-teal px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-600">Get Started</Link>
        <Link href="/login" className="rounded border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium">Sign in</Link>
      </div>
    </main>
  );
}
