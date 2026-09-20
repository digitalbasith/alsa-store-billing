# Alsa Store Billing — Firebase setup

The application backend is **Firebase Authentication + Cloud Firestore**. Supabase is no longer required by the application.

## Firebase project

Project ID: `alsa-store-billing`

Console: Firebase Console -> project `alsa-store-billing`.

## 1. Add a Web App

In Firebase Console open:

**Project settings -> General -> Your apps -> Add app -> Web**

Register a web app (for example `Alsa Store Billing Web`) and copy the SDK configuration.

The app needs these Vercel variables:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` (normally `alsa-store-billing.firebaseapp.com`)
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID=alsa-store-billing`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

Storage bucket and messaging sender ID are optional for the current billing features.

## 2. Enable Email/Password Authentication

Open **Authentication -> Sign-in method -> Email/Password** and enable it.

## 3. Create Cloud Firestore

Open **Firestore Database -> Create database**. Use production mode and choose a region appropriate for the store.

## 4. Deploy the included Firestore rules

The repository contains `firebase.json`, `.firebaserc`, `firestore.rules`, and `firestore.indexes.json`.

With Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules,firestore:indexes
```

## 5. Configure Vercel

Add the Firebase Web App variables to the Vercel project for Production (and Preview if required), then redeploy.

Until the API key and App ID are configured, the site intentionally stays in demo mode instead of writing to another database.

## 6. First owner

Open the deployed app, create the owner account with Email/Password, and complete the store setup form. The app creates the store membership, settings and starter catalogue in Firestore.

## Data migration note

Changing the code backend does not automatically copy old Supabase rows. If the previous Supabase database contains real client data that must be retained, export/import that data separately before deleting the old project.
