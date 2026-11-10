import Link from "next/link";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui";

export function UpgradeNotice({ feature, status }: { feature: string; status?: string }) {
  return (
    <Card className="max-w-xl border-teal/40 bg-mint">
      <Lock className="h-6 w-6 text-teal-600" aria-hidden />
      <h2 className="mt-3 text-xl font-semibold">{feature} is a Professional feature</h2>
      <p className="mt-2 text-sm text-navy/80">
        {status === "active"
          ? "Your Starter plan does not include this. Upgrade to Professional to unlock it."
          : "Choose a plan and complete payment to unlock this feature. Access is enabled only after your payment is confirmed."}
      </p>
      <Link href="/dashboard/billing" className="mt-4 inline-flex h-10 items-center rounded-full bg-navy px-5 text-sm font-semibold text-white hover:bg-navy-700">View plans</Link>
    </Card>
  );
}
