# Alsa Store Billing

Alsa Store Billing is a Next.js billing and store-operations app backed by **Firebase Authentication + Cloud Firestore**.

## Features

- POS billing with cash / UPI / card flows
- Product catalogue, barcode, stock and purchases
- Single-product and multi-select bulk delete/archive
- Customers, suppliers, staff and role-aware access
- Sales, profit, accounts and operational reports
- Firebase Email/Password authentication
- Firestore transactions for sales, purchases and stock
- Store-scoped Firestore Security Rules
- PWA-ready responsive interface

## Firebase project

This repository is prepared for the Firebase project:

`alsa-store-billing`

See `FIREBASE_SETUP.md` for the one-time console setup, Vercel environment variables, and Firestore rules deployment.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Production

Vercel installs dependencies with `npm install` and runs `npm run build`. The build materializes the Firebase adapter before compiling the Next.js app.
