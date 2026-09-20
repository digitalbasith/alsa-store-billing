# Alsa Store Billing — Source Code Setup

This package contains the frontend application, Supabase database SQL, RLS policies,
atomic sales/purchase functions, and the `invite-staff` Edge Function used by the
Alsa Store billing app.

## Requirements

- Node.js 22.13 or newer
- npm
- A Supabase project
- Vercel account (optional for deployment)

## 1. Run locally

```bash
npm ci
cp .env.example .env.local
```

Edit `.env.local` and enter the browser-safe values from Supabase project settings:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Then start the app:

```bash
npm run dev
```

## 2. Create the Supabase database

Open Supabase SQL Editor and run these files once, in this order:

1. `supabase/nila_schema.sql`
2. `supabase/nila_performance_hardening.sql`
3. `supabase/nila_purchase_receipt.sql`
4. `supabase/nila_enterprise_operations.sql`
5. `supabase/nila_enterprise_operations_fix.sql`
6. `supabase/nila_enterprise_operations_performance.sql`

The schema includes store-level data isolation, role-based access, RLS policies,
products, barcodes, sales, purchases, returns, stock movement, accounts, quotations,
delivery, day-end, expenses, loyalty, and audit history.

## 3. Deploy the staff invitation function

Install and log in to the Supabase CLI, link the new project, then deploy:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy invite-staff
```

The Edge Function needs server-side Supabase URL, anonymous/publishable key, and
service-role key values supplied by the Supabase runtime. Never expose a service-role
key through `NEXT_PUBLIC_*`, frontend code, Git, or Vercel browser variables.

## 4. Supabase Auth settings

- Enable Email authentication.
- Add the local URL and production URL to the allowed redirect URLs.
- Configure email confirmation based on the shop's preferred sign-up flow.
- The first signed-in user can create the store and becomes its Super Admin.

## 5. Deploy to Vercel

Import this source into a Git repository or deploy it with the Vercel CLI. Add these
environment variables to Production, Preview, and Development:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

The included `vercel.json` uses `npm ci` and a Next.js production build.

## Useful commands

```bash
npm run dev
npm run build
npm test
npm run lint
```

## தமிழ் குறிப்பு

`.env.local` file-ல் Supabase URL மற்றும் publishable key மட்டும் சேர்க்கவும்.
Service-role key-ஐ frontend அல்லது Vercel public variable-ல் சேர்க்கக்கூடாது.
மேலே கொடுக்கப்பட்ட SQL files-ஐ அதே வரிசையில் Supabase SQL Editor-ல் run செய்த பிறகு
app-ஐ பயன்படுத்தலாம். Live shop data, user passwords, OTP, private keys ஆகியவை இந்த
source package-ல் சேர்க்கப்படவில்லை.
