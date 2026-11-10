import Link from "next/link";
import { Check } from "lucide-react";

const STARTER = [
  "Inventory management",
  "Product and category management",
  "Stock level tracking",
  "Expiry date monitoring",
  "Low-stock notifications",
  "Basic inventory analytics",
  "Inventory data imports",
  "AI inventory insights with a limited monthly usage allowance",
  "Standard reporting",
  "Email support",
];
const PRO = [
  "Advanced AI inventory analysis",
  "Demand forecasting",
  "Stockout risk analysis",
  "Advanced inventory analytics",
  "Multi-location inventory management",
  "Supplier management",
  "Procurement insights",
  "Advanced reporting and exports",
  "Higher AI usage allowance",
  "Priority support",
];

function Plan({ name, price, blurb, features, lead, plan, dark }: {
  name: string; price: number; blurb: string; features: string[]; lead?: string; plan: string; dark?: boolean;
}) {
  return (
    <div className={`flex flex-col rounded-2xl p-7 sm:p-9 ${dark ? "bg-navy text-white" : "border border-slate-200 bg-white"}`}>
      <h3 className="text-sm font-semibold uppercase tracking-widest text-teal">{name}</h3>
      <p className="mt-4 flex items-baseline gap-2">
        <span className="text-6xl font-extrabold tracking-tight">${price}</span>
        <span className={dark ? "text-white/70" : "text-slate-500"}>per month</span>
      </p>
      <p className={`mt-1 text-xs ${dark ? "text-white/60" : "text-slate-500"}`}>Billed monthly in USD</p>
      <p className={`mt-4 text-sm ${dark ? "text-white/80" : "text-slate-600"}`}>{blurb}</p>
      <Link
        href={`/register?plan=${plan}`}
        className={`mt-6 rounded-full px-6 py-3.5 text-center text-sm font-semibold ${dark ? "bg-teal text-white hover:bg-teal-600" : "bg-navy text-white hover:bg-navy-700"}`}
      >
        Get Started
      </Link>
      {lead && <p className="mt-7 text-sm font-semibold">{lead}</p>}
      <ul className={`${lead ? "mt-3" : "mt-7"} space-y-2.5 text-sm`}>
        {features.map((f) => (
          <li key={f} className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden /> <span>{f}</span></li>
        ))}
      </ul>
    </div>
  );
}

export function Pricing() {
  return (
    <div className="mt-12 grid gap-5 lg:grid-cols-2">
      <Plan name="Starter" price={47} plan="starter" blurb="Suitable for smaller healthcare organizations and independent pharmacies." features={STARTER} />
      <Plan name="Professional" price={97} plan="professional" dark blurb="Suitable for growing healthcare businesses, hospitals and multi-location operators." lead="Everything in Starter, plus:" features={PRO} />
    </div>
  );
}
