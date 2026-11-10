import Link from "next/link";
import {
  Boxes, LineChart, CalendarClock, TrendingDown, ShoppingCart, BarChart3, MapPin, BellRing,
  Building2, Pill, FlaskConical, Network, Truck,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { SiteNav } from "@/components/marketing/nav";
import { Pricing } from "@/components/marketing/pricing";
import { DashboardPreview } from "@/components/marketing/dashboard-preview";

const FEATURES = [
  [Boxes, "Smart Inventory Tracking", "Monitor medical supplies, pharmaceuticals and essential healthcare products from one centralized dashboard. Know what you have, where it is and when it needs replenishment."],
  [LineChart, "AI-Powered Demand Forecasting", "Use historical inventory and consumption data to identify purchasing patterns and forecast future supply requirements. Make procurement decisions based on data rather than assumptions."],
  [CalendarClock, "Expiry Date Monitoring", "Stay ahead of expiration dates with automated tracking and timely alerts. Identify products approaching expiration and take action before they become a loss."],
  [TrendingDown, "Stockout Prediction", "Identify products at risk of running out based on stock levels, usage patterns and historical consumption. Give your team more time to plan replenishment."],
  [ShoppingCart, "Intelligent Procurement", "Make smarter purchasing decisions with inventory reports, reorder recommendations and supplier performance insights."],
  [BarChart3, "Inventory Analytics & Reporting", "Understand inventory movements, consumption trends, stock value, wastage and purchasing patterns through easy-to-understand reports."],
  [MapPin, "Multi-Location Inventory Management", "Monitor inventory across multiple branches, warehouses and healthcare facilities from a centralized platform."],
  [BellRing, "Automated Inventory Alerts", "Receive notifications for low stock, approaching expiration dates, unusual inventory movements and replenishment requirements."],
] as const;

const CUSTOMERS = [
  [Building2, "Hospitals & Medical Centres", "Manage essential medical supplies, monitor stock levels across departments and reduce operational disruptions."],
  [Pill, "Pharmacies", "Track pharmaceutical inventory, monitor expiration dates, understand product demand and optimize purchasing."],
  [FlaskConical, "Diagnostic & Medical Laboratories", "Maintain visibility into laboratory reagents, testing materials and other essential consumables."],
  [Network, "Healthcare Networks", "Manage inventory across multiple facilities with centralized reporting and operational oversight."],
  [Truck, "Medical Supply Distributors", "Monitor stock movements, purchasing patterns and product availability across your distribution operations."],
] as const;

const AI_POINTS = [
  "Identify products with unusually high consumption.",
  "Detect recurring stock shortages.",
  "Highlight products approaching expiration.",
  "Analyze historical purchasing patterns.",
  "Estimate future inventory requirements.",
  "Identify potential inventory inefficiencies.",
];

const DASH_POINTS = [
  "Total inventory value.",
  "Available stock and low-stock items.",
  "Products approaching expiration.",
  "Stock movements and consumption.",
  "Pending purchase orders.",
  "Inventory performance trends.",
];

const BENEFITS = [
  ["Less Inventory Waste", "Identify products approaching expiration and make timely decisions."],
  ["Fewer Stock Shortages", "Anticipate replenishment requirements and improve inventory availability."],
  ["Smarter Procurement", "Use consumption data and inventory insights to plan purchases."],
  ["Better Visibility", "Monitor inventory across departments and locations."],
  ["Time-Saving Automation", "Reduce repetitive spreadsheet work and manual inventory monitoring."],
  ["Data-Driven Decisions", "Replace guesswork with clear reports and actionable intelligence."],
];

const FAQ = [
  ["What is Mediverse?", "Mediverse is an AI-powered medical inventory intelligence platform designed to help healthcare organizations monitor stock, forecast demand, track expiration dates and improve procurement decisions."],
  ["Who can use Mediverse?", "Hospitals, pharmacies, clinics, diagnostic laboratories, healthcare networks and medical supply businesses."],
  ["Can I upload my existing inventory data?", "Yes. Mediverse supports inventory data uploads, allowing organizations to analyze existing records and gain insights from their data."],
  ["Can Mediverse track expiration dates?", "Yes. The platform supports expiration-date monitoring and alerts for products approaching their expiration dates."],
  ["Does Mediverse support multiple locations?", "The platform supports centralized inventory visibility across multiple facilities and locations, subject to the selected subscription plan."],
  ["Does Mediverse replace inventory personnel?", "No. Mediverse supports inventory teams by automating monitoring, organizing information and providing insights to improve decision-making."],
];

const pill = "inline-flex items-center justify-center rounded-full px-7 py-3.5 text-base font-semibold transition-colors";
const h2 = "text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl";

export default function Home() {
  return (
    <>
      <SiteNav />
      <main>
        {/* HERO */}
        <section className="px-3 pt-3 sm:px-6">
          <div className="mx-auto grid max-w-6xl items-center gap-10 rounded-3xl bg-mint px-6 py-14 sm:px-12 sm:py-20 lg:grid-cols-2">
            <div>
              <h1 className="text-5xl font-extrabold leading-[0.98] tracking-tight text-navy sm:text-7xl">
                Your Medical Inventory. Under Control. Powered by Intelligence.
              </h1>
              <p className="mt-6 max-w-xl text-lg text-navy/80">
                Take control of your medical inventory with AI-powered insights that help you prevent stockouts, reduce waste, monitor expiration dates and make smarter procurement decisions.
              </p>
              <p className="mt-3 max-w-xl text-navy/70">
                Mediverse gives hospitals, pharmacies, clinics and healthcare providers the visibility they need to manage medical supplies efficiently.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/register" className={`${pill} bg-navy text-white hover:bg-navy-700`}>Get Started</Link>
                <Link href="/#features" className={`${pill} bg-white text-navy hover:bg-white/70`}>Explore Features</Link>
              </div>
              <p className="mt-6 text-sm font-medium text-navy/70">
                No more guesswork. No more unnecessary inventory losses. Just smarter medical inventory management.
              </p>
            </div>
            <DashboardPreview />
          </div>
        </section>

        {/* TRUST / PROBLEM */}
        <section className="px-3 pt-3 sm:px-6">
          <div className="mx-auto max-w-6xl rounded-3xl bg-navy px-6 py-16 text-white sm:px-12 sm:py-24">
            <h2 className={`${h2} max-w-4xl`}>Trusted Inventory Intelligence for Modern Healthcare</h2>
            <div className="mt-8 grid gap-6 text-lg text-white/80 lg:grid-cols-2">
              <p>Managing medical supplies shouldn&apos;t be a daily struggle.</p>
              <p>
                From unexpected stock shortages to expired products and inefficient purchasing, poor inventory management creates unnecessary costs and operational challenges for healthcare organizations.
                Mediverse brings your inventory operations into one intelligent platform, helping your team stay organized, anticipate demand and make informed decisions.
              </p>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="scroll-mt-24 px-3 pt-3 sm:px-6">
          <div className="mx-auto max-w-6xl rounded-3xl bg-white px-6 py-16 sm:px-12 sm:py-24">
            <h2 className={`${h2} max-w-3xl`}>Everything You Need to Manage Medical Inventory</h2>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(([Icon, title, text]) => (
                <article key={title} className="rounded-2xl bg-soft p-6">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-navy text-mint"><Icon className="h-5 w-5" aria-hidden /></span>
                  <h3 className="mt-5 text-lg font-bold leading-snug">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* CUSTOMERS */}
        <section id="customers" className="scroll-mt-24 px-3 pt-3 sm:px-6">
          <div className="mx-auto max-w-6xl rounded-3xl bg-teal px-6 py-16 text-navy sm:px-12 sm:py-24">
            <h2 className={h2}>Built for Healthcare Organizations</h2>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CUSTOMERS.map(([Icon, title, text]) => (
                <article key={title} className="rounded-2xl bg-white/95 p-6">
                  <Icon className="h-7 w-7 text-teal-600" aria-hidden />
                  <h3 className="mt-4 text-xl font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* AI */}
        <section id="ai" className="scroll-mt-24 px-3 pt-3 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-10 rounded-3xl bg-navy px-6 py-16 text-white sm:px-12 sm:py-24 lg:grid-cols-2">
            <div>
              <h2 className={h2}>Make Better Inventory Decisions With AI</h2>
              <p className="mt-6 text-lg text-white/80">
                Your inventory data holds valuable insights. Mediverse helps you turn that information into practical business intelligence.
              </p>
              <p className="mt-4 text-white/70">Get actionable insights without spending hours manually reviewing spreadsheets.</p>
            </div>
            <div>
              <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-teal">Upload inventory records and get analysis that helps you</p>
              <ul className="space-y-3">
                {AI_POINTS.map((p) => (
                  <li key={p} className="rounded-xl bg-white/10 px-5 py-4 text-base">{p}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* DASHBOARD */}
        <section className="px-3 pt-3 sm:px-6">
          <div className="mx-auto grid max-w-6xl items-center gap-10 rounded-3xl bg-mint px-6 py-16 sm:px-12 sm:py-24 lg:grid-cols-2">
            <div>
              <h2 className={h2}>Your Inventory. Your Data. Your Decisions.</h2>
              <p className="mt-6 text-lg text-navy/80">Your dashboard gives you visibility into:</p>
              <ul className="mt-4 space-y-2 text-navy/90">
                {DASH_POINTS.map((p) => <li key={p} className="flex gap-3"><span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-teal" />{p}</li>)}
              </ul>
            </div>
            <DashboardPreview />
          </div>
        </section>

        {/* BENEFITS */}
        <section className="px-3 pt-3 sm:px-6">
          <div className="mx-auto max-w-6xl rounded-3xl bg-white px-6 py-16 sm:px-12 sm:py-24">
            <h2 className={h2}>Why Choose Mediverse?</h2>
            <div className="mt-12 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {BENEFITS.map(([t, d]) => (
                <div key={t} className="border-t-4 border-teal pt-4">
                  <h3 className="text-xl font-bold">{t}</h3>
                  <p className="mt-2 text-slate-600">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className="scroll-mt-24 px-3 pt-3 sm:px-6">
          <div className="mx-auto max-w-6xl rounded-3xl bg-soft px-6 py-16 sm:px-12 sm:py-24">
            <h2 className={`${h2} max-w-3xl`}>Simple Pricing. Smarter Inventory Management.</h2>
            <p className="mt-4 max-w-2xl text-slate-600">Both plans are billed monthly in US dollars. Your plan is activated after your payment is confirmed.</p>
            <Pricing />
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-24 px-3 pt-3 sm:px-6">
          <div className="mx-auto max-w-6xl rounded-3xl bg-white px-6 py-16 sm:px-12 sm:py-24">
            <h2 className={h2}>Frequently Asked Questions</h2>
            <div className="mt-10 max-w-3xl divide-y divide-slate-200 border-y border-slate-200">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold">
                    {q}<span className="text-2xl text-teal transition-transform group-open:rotate-45" aria-hidden>+</span>
                  </summary>
                  <p className="mt-3 text-slate-600">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="px-3 py-3 sm:px-6">
          <div className="mx-auto max-w-6xl rounded-3xl bg-navy px-6 py-16 text-center text-white sm:px-12 sm:py-24">
            <h2 className={`${h2} mx-auto max-w-3xl`}>Smarter Inventory. Better Healthcare Operations.</h2>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-white/80">
              Stop managing medical supplies through guesswork and disconnected spreadsheets. Bring your inventory operations together with Mediverse.
            </p>
            <Link href="/register" className={`${pill} mt-8 bg-teal text-white hover:bg-teal-600`}>Get Started Today</Link>
          </div>
        </section>
      </main>

      <footer className="px-6 pb-10 pt-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <Logo />
          <p className="max-w-xl">
            Mediverse is an inventory intelligence and operational management platform. It is not a clinical decision-making system and must not be used to store patient-identifiable information.
          </p>
          <p>© {new Date().getFullYear()} Mediverse</p>
        </div>
      </footer>
    </>
  );
}
