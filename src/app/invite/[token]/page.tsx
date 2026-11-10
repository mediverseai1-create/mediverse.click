import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

async function accept(token: string) {
  "use server";
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) redirect(`/invite/${token}?error=${encodeURIComponent(error.message.includes("different email") ? "This invitation was sent to a different email address. Sign in with the invited address." : error.message.includes("expired") || error.message.includes("invalid") ? "This invitation is invalid or has expired." : "Could not accept the invitation. You may already belong to an organization.")}`);
  redirect("/dashboard");
}

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const valid = /^[0-9a-f-]{36}$/i.test(token);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <Logo className="mb-8" />
      <div className="w-full max-w-md space-y-4 rounded-lg border border-slate-200 bg-white p-8">
        <h1 className="text-xl font-semibold">You have been invited to Mediverse</h1>
        {valid ? (
          <>
            <p className="text-sm text-slate-600">Accept to join the organization that invited you. You must be signed in with the email address the invitation was sent to.</p>
            {error && <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <form action={accept.bind(null, token)}><Button type="submit" className="w-full">Accept invitation</Button></form>
          </>
        ) : <p className="text-sm text-red-700">This invitation link is not valid.</p>}
      </div>
    </main>
  );
}
