import Link from "next/link";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Verify your email</h1>
      <p className="text-sm text-slate-600">
        We sent a confirmation link{email ? <> to <strong>{email}</strong></> : ""}. Open it to activate your account, then continue setting up your organization.
      </p>
      <Link href="/login" className="text-sm font-medium text-teal-600 hover:underline">Go to sign in</Link>
    </div>
  );
}
