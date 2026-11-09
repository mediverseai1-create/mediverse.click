import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <Logo className="mb-8" />
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 sm:p-8">{children}</div>
      <p className="mt-6 max-w-md text-center text-xs text-slate-500">
        Mediverse manages medical inventory only. Do not enter patient-identifiable information.
      </p>
    </main>
  );
}
