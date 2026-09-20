"use client";

import { useEffect } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { collection, getDocs, getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDoJZkKsXrwG7d7QsYBQhdO7IfGcOG8gws",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "alsa-store-billing.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "alsa-store-billing",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "alsa-store-billing.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "918214002690",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:918214002690:web:588127c30be3946574bf1b",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-ZGP48F4W4X",
};

type ProductDoc = { id: string; name_en?: string; purchase_price?: number | string; selling_price?: number | string };
type BarcodeDoc = { product_id?: string; barcode?: string };

function clientDb() {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  return { db: getFirestore(app), auth: getAuth(app) };
}

function money(value: number | string | undefined) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(number);
}

export function ProductPurchaseRateHelper() {
  useEffect(() => {
    const styleId = "alsa-product-purchase-rate-style";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        .product-table.simplified.selectable .table-row {
          grid-template-columns: 30px minmax(170px,2fr) minmax(105px,1.05fr) minmax(95px,1fr) minmax(95px,1fr) minmax(100px,1fr) 64px 58px 88px 118px !important;
        }
        .alsa-purchase-rate-cell strong { color:#1f315f; }
        .alsa-purchase-rate-cell small { color:#8090aa; }
        @media (max-width: 860px) {
          .product-table.simplified.selectable .table-row {
            grid-template-columns: 24px 1.8fr 1fr 1fr 1fr 1fr 56px 48px 78px 92px !important;
            min-width: 980px;
          }
        }
      `;
      document.head.appendChild(style);
    }

    let priceByBarcode = new Map<string, string>();
    let priceByName = new Map<string, string>();
    let loading = false;

    const loadRates = async () => {
      if (loading || priceByBarcode.size || priceByName.size) return;
      loading = true;
      try {
        const { db, auth } = clientDb();
        if (!auth.currentUser) return;
        const [productSnap, barcodeSnap] = await Promise.all([
          getDocs(collection(db, "products")),
          getDocs(collection(db, "product_barcodes")),
        ]);
        const products = new Map<string, ProductDoc>();
        productSnap.forEach((item) => {
          const data = item.data() as ProductDoc;
          const purchase = data.purchase_price ?? Number(data.selling_price || 0) * 0.78;
          products.set(item.id, { ...data, id: item.id, purchase_price: purchase });
          if (data.name_en) priceByName.set(String(data.name_en).trim().toLowerCase(), money(purchase));
        });
        barcodeSnap.forEach((item) => {
          const data = item.data() as BarcodeDoc;
          const product = data.product_id ? products.get(data.product_id) : null;
          if (product && data.barcode) priceByBarcode.set(String(data.barcode).trim(), money(product.purchase_price));
        });
      } catch {
        // Keep UI usable when Firestore rules are not published yet.
      } finally {
        loading = false;
      }
    };

    const injectColumn = async () => {
      const table = document.querySelector<HTMLElement>(".product-table.simplified.selectable");
      if (!table) return;
      await loadRates();

      const head = table.querySelector<HTMLElement>(".table-head-row");
      if (head && !head.querySelector(".alsa-purchase-rate-head")) {
        const title = document.createElement("span");
        title.className = "alsa-purchase-rate-head";
        title.textContent = "Purchase rate";
        head.insertBefore(title, head.children[5] || null);
      }

      const rows = Array.from(table.querySelectorAll<HTMLElement>(".table-row:not(.table-head-row)"));
      rows.forEach((row) => {
        if (row.querySelector(".alsa-purchase-rate-cell")) return;
        const productName = row.querySelector<HTMLElement>(".table-product strong")?.textContent?.trim().toLowerCase() || "";
        const barcode = row.children[2]?.textContent?.trim() || "";
        const value = priceByBarcode.get(barcode) || priceByName.get(productName) || "—";
        const cell = document.createElement("span");
        cell.className = "alsa-purchase-rate-cell";
        cell.innerHTML = `<strong>${value}</strong><small>Cost</small>`;
        row.insertBefore(cell, row.children[5] || null);
      });
    };

    const interval = window.setInterval(() => void injectColumn(), 900);
    const observer = new MutationObserver(() => void injectColumn());
    observer.observe(document.body, { childList: true, subtree: true });
    void injectColumn();
    return () => { window.clearInterval(interval); observer.disconnect(); };
  }, []);

  return null;
}
