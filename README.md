# Mediverse

AI-powered medical inventory intelligence for hospitals, pharmacies, laboratories, healthcare networks and medical distributors. Live site: https://mediverse.click

Mediverse is an **inventory and operations platform**. It is not a clinical system. Do not store patient-identifiable information in it. This project makes no claim of HIPAA compliance or any security certification.

## What it does

| Area | Starter ($47/mo) | Professional ($97/mo) |
|---|---|---|
| Inventory, categories, stock movements, batches | Yes | Yes |
| Expiry tracking, stock alerts, notification centre | Yes | Yes |
| CSV / Excel import with column mapping and validation | Yes | Yes |
| Basic analytics, valuation, CSV exports | Yes | Yes |
| AI assistant (monthly allowance) | 50 requests | 500 requests |
| Locations | 1 | Unlimited |
| Demand forecasting and stockout risk | - | Yes |
| Suppliers and supplier performance | - | Yes |
| Procurement (requests, orders, approvals, receiving) | - | Yes |
| Advanced reports and exports | - | Yes |

Allowances and location limits live in the `plan_limits` table. Edit the rows to change them, no code change needed.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · Supabase (Postgres, Auth, Row Level Security) · Recharts · Vitest.
The AI provider is any OpenAI-compatible chat API, configured by environment variables only.

## How security works

- **Row Level Security** is on (and forced) for every table. A user can only read rows of organizations they belong to.
- **Plan limits are enforced in the database** (triggers and functions), not just in the UI. Starter accounts cannot create suppliers, purchase orders or extra locations even by calling the API directly.
- **Stock quantity can only change through recorded movements.** Direct edits are blocked by a trigger. Stock cannot go negative.
- **Subscriptions can only be changed by the server** with the service-role key. Customers cannot activate their own plan. Functions that change entitlements are not callable by customers or anonymous visitors.
- The AI assistant receives summarized data for the signed-in user's own organization only, cannot change anything, and is limited by allowance and a per-minute rate limit enforced in the database.
- Inputs are validated with zod. CSV exports neutralize spreadsheet formulas. Security headers are set in `next.config.mjs`. Audit logs record sensitive actions.

## Payments (important)

Payments use the Selar payment links in `STARTER_PAYMENT_LINK` and `PROFESSIONAL_PAYMENT_LINK`.

Being redirected back from a payment page does **not** activate anything. The flow is:

1. An owner or administrator clicks **Pay** on Billing & Subscription and completes payment on Selar.
2. They return and submit their Selar order reference and the email they paid with. Status becomes "Awaiting payment verification" and **no access is granted**.
3. A platform operator (an email listed in `PLATFORM_ADMIN_EMAILS`) opens `/admin/payments`, compares the claim with the sale in the Selar dashboard, and clicks **Verified: activate**. The plan is activated for 30 days.
4. Access ends automatically when the period ends. To renew, the customer pays again and submits a new reference.

A signed webhook endpoint is also included at `POST /api/webhooks/payment`. Selar's webhook format could not be confirmed from public documentation, so the endpoint uses a provider-neutral format and is **not connected to Selar**. See `docs/DEPLOYMENT.md` for the format and how to sign a request. If Selar (or an automation tool) can send it, renewals can become automatic.

## Getting started locally

```bash
npm install
cp .env.example .env.local     # then fill in the values
npm run dev                    # http://localhost:3000
```

Apply the database migrations **in order** in the Supabase SQL Editor (or with the Supabase CLI): every file in `supabase/migrations/`, from `…0001` to `…0005`. Details are in `docs/DEPLOYMENT.md`.

## Tests

```bash
npm run typecheck
npm test                              # 30 unit tests: stock rules, expiry, forecasting, import, CSV, webhook signing
node scripts/e2e-db.cjs               # 45 live checks: stock rules, plan gates, procurement, isolation (needs .env.local)
node scripts/e2e-phase5-6.cjs         # 55 live checks: import, payments, AI limits, team roles (needs .env.local)
npm run build
```

The two `e2e` scripts talk to the Supabase project in `.env.local`. They create temporary users and organizations and delete them afterwards. Run them against a staging project if you can.

## Project layout

```
src/app/            pages, server actions and route handlers
src/components/     UI building blocks
src/lib/            business rules (inventory-logic, forecast, import, csv, webhook) and Supabase helpers
supabase/migrations version-controlled database schema, security rules and functions
scripts/            live end-to-end database tests
docs/               deployment guide
```

## Known limitations

- **Selar renewals are manual** until a webhook is connected (see above).
- **Invitation emails are not sent.** The invitation link is shown in Settings for you to share.
- **Notification emails are not sent.** Alerts appear in the app; the "email notifications" switch is stored for future use.
- **One organization per user** for now.
- **Dependency note:** `npm audit` reports a high-severity zod (v3) issue about memory use on very large arrays. Fixing it requires a major zod upgrade. All list inputs in the app have size limits. Plan to upgrade zod 4 after regression testing.
- Page speed depends on distance to the Supabase region. Deploy to the Vercel region closest to your Supabase project.
