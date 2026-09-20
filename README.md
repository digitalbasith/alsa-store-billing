# Alsa Store Billing

Alsa Store Billing is a supermarket/store billing and operations app built with Next.js, React, Supabase, and Vercel.

## Features

- POS billing with Cash / UPI / Card flows
- Product catalogue, barcodes, stock and purchases
- Customers, suppliers, staff and role-based access
- Sales, profit, account and operational reports
- Supabase authentication, RLS and store-level data isolation
- PWA-ready responsive interface

## Run locally

```bash
npm ci
cp .env.example .env.local
npm run dev
```

The browser-safe Supabase variables are optional in this snapshot because the app retains the existing publishable fallback connection used by the source application. For a dedicated Alsa Store backend, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in Vercel and follow `ALSA_SETUP.md`.

## Production build

```bash
npm run lint
npx next build
```

Vercel configuration is included in `vercel.json`.
