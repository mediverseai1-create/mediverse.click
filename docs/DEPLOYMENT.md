# Deployment guide

Follow these steps in order. Nothing here needs coding.

## 1. Supabase (database and sign-in)

1. Open your project at supabase.com.
2. **SQL Editor → New query.** Run each file from `supabase/migrations/` **once, in this order**, one file per query:
   1. `20260101000001_core_schema.sql`
   2. `20260101000002_rls_and_functions.sql`
   3. `20260101000003_app_functions.sql`
   4. `20260101000004_import_ai.sql`
   5. `20260101000005_billing_team.sql`
3. **Authentication → URL Configuration**
   - Site URL: `https://mediverse.click`
   - Redirect URLs: add `https://mediverse.click/**` and `http://localhost:3000/**`
4. **Authentication → Providers → Email:** keep **Confirm email** switched ON.
5. **Authentication → Emails (SMTP):** Supabase's built-in email sender is limited to a few emails per hour and is meant for testing. Before launch, add your own SMTP provider (for example Resend, Postmark or Amazon SES) so verification and password-reset emails are reliable.
6. **Project Settings → API:** copy the Project URL, the `anon` key and the `service_role` key. The `service_role` key is a secret: it goes only into Vercel's environment variables, never into code or chat.
7. **Project Settings → General:** note your project's **region** (for example "West EU (Ireland)"). You will use it in step 3.

## 2. Payment links (Selar)

Your two links are already in `.env.example` format. In Vercel you will set:

- `STARTER_PAYMENT_LINK` = `https://selar.com/47plan?currency=USD`
- `PROFESSIONAL_PAYMENT_LINK` = `https://selar.com/97plan?currency=USD`

## 3. Vercel

1. Push the repository to GitHub (already done) and **Add New → Project** in Vercel, importing `mediverseai1-create/mediverse.click`.
2. Framework preset: **Next.js** (detected automatically). No build settings need changing.
3. **Settings → Functions → Function Region:** choose the region **closest to your Supabase region**. This is the biggest factor in page speed, because each page makes several database calls.
4. **Settings → Environment Variables.** Add these for Production (and Preview if you use it):

| Name | Value | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL from Supabase | no |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` key | no |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key | **yes** |
| `NEXT_PUBLIC_APP_URL` | `https://mediverse.click` | no |
| `AI_API_KEY` | key from your AI provider (use a **new** key, not one shared in chat) | **yes** |
| `AI_MODEL` | for example `gemini-flash-lite-latest` | no |
| `AI_BASE_URL` | for Gemini: `https://generativelanguage.googleapis.com/v1beta/openai` | no |
| `STARTER_PAYMENT_LINK` | see step 2 | no |
| `PROFESSIONAL_PAYMENT_LINK` | see step 2 | no |
| `PLATFORM_ADMIN_EMAILS` | comma-separated emails allowed to verify payments, for example `mediverseai1@gmail.com` | no |
| `PAYMENT_WEBHOOK_SECRET` | a long random string (only needed if you use the webhook; see below) | **yes** |

5. **Deploy.**
6. **Settings → Domains:** add `mediverse.click` and follow Vercel's DNS instructions at your domain registrar.
7. After the domain works, open `https://mediverse.click`, register, verify the email, and finish onboarding.

## 4. Google (Gemini) billing

The key used during development appears to be on a free tier with strict limits and some models unavailable. In Google AI Studio / Google Cloud, enable billing for the project that owns the key before real customers use the assistant. Models change often: if the assistant stops answering, check `AI_MODEL` against the provider's current model list.

## 5. Verifying payments (daily routine)

1. A customer pays through Selar and submits their order reference in the app.
2. Open `https://mediverse.click/admin/payments` (sign in with an email listed in `PLATFORM_ADMIN_EMAILS`).
3. Open your Selar dashboard and compare: **order reference, buyer email and amount** ($47 Starter, $97 Professional).
4. If they match, click **Verified: activate**. If not, click **Reject** and add a note.
5. Each month, repeat for renewals. The **Current subscriptions** table shows when each plan ends, and **End access now** removes access immediately (for refunds or chargebacks).

## 6. Optional: automatic activation through the webhook

Only possible if Selar (or an automation tool such as Zapier or Make) can send an HTTPS request when a sale happens.

`POST https://mediverse.click/api/webhooks/payment`

Headers: `Content-Type: application/json` and `x-mediverse-signature: <hex HMAC-SHA256 of the exact request body using PAYMENT_WEBHOOK_SECRET>`

Body:

```json
{
  "event_id": "unique-id-for-this-sale",
  "type": "payment_succeeded",
  "email": "customer@example.com",
  "plan": "starter",
  "period_days": 30,
  "provider": "selar",
  "reference": "SELAR-ORDER-123"
}
```

`type` can be `payment_succeeded`, `payment_failed`, `subscription_cancelled` or `subscription_expired`. The customer is matched by the **owner's account email**, repeated events with the same `event_id` are ignored, and requests with a wrong signature are rejected with 401. Never expose the secret in a browser or a public automation step.

## 7. Before you take real customers

- [ ] Replace every key that was ever pasted into chat (Supabase `service_role`, AI key). In Supabase: Project Settings → API → reset the key; update Vercel.
- [ ] Add custom SMTP in Supabase (step 1.5) and send yourself a test verification email and a password-reset email.
- [ ] Make a test purchase of the Starter plan, submit the reference, verify it in `/admin/payments`, and confirm the customer's access.
- [ ] Turn on billing for the AI provider key (step 4).
- [ ] Have a lawyer review the Terms of Service and Privacy Policy you publish. Mediverse does not currently include them.
- [ ] Run the live checks once against your production project: `node scripts/e2e-db.cjs` and `node scripts/e2e-phase5-6.cjs`.

## Troubleshooting

- **"Invalid login credentials" after registering:** the email is not verified yet. Open the link in the email.
- **Verification link goes to localhost:** `NEXT_PUBLIC_APP_URL` or the Supabase Site URL is wrong.
- **Pages are slow:** Vercel region is far from the Supabase region (step 3.3).
- **AI assistant says it is not configured:** `AI_API_KEY` or `AI_MODEL` is missing in Vercel. Redeploy after changing variables.
- **Customer paid but has no access:** they must submit the reference in Billing, then you verify it in `/admin/payments`.
