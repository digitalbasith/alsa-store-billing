"use client";

import { useEffect } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { collection, doc, getDocs, getFirestore, query, updateDoc, where } from "firebase/firestore";

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

function toNumber(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Number(number.toFixed(2)) : 0;
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
        .alsa-purchase-rate-field { animation: alsaFade .18s ease-out; }
        .alsa-purchase-rate-field small { color:#8792a8; font-weight:700; }
        @keyframes alsaFade { from { opacity:.4; transform: translateY(-2px); } to { opacity:1; transform:none; } }
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
    let rawByBarcode = new Map<string, number>();
    let rawByName = new Map<string, number>();
    let loading = false;

    const loadRates = async (force = false) => {
      if (loading || (!force && (priceByBarcode.size || priceByName.size))) return;
      loading = true;
      try {
        const { db, auth } = clientDb();
        if (!auth.currentUser) return;
        const [productSnap, barcodeSnap] = await Promise.all([
          getDocs(collection(db, "products")),
          getDocs(collection(db, "product_barcodes")),
        ]);
        const products = new Map<string, ProductDoc>();
        const nextPriceByBarcode = new Map<string, string>();
        const nextPriceByName = new Map<string, string>();
        const nextRawByBarcode = new Map<string, number>();
        const nextRawByName = new Map<string, number>();
        productSnap.forEach((item) => {
          const data = item.data() as ProductDoc;
          const purchase = toNumber(data.purchase_price) || toNumber(Number(data.selling_price || 0) * 0.78);
          products.set(item.id, { ...data, id: item.id, purchase_price: purchase });
          if (data.name_en) {
            nextPriceByName.set(String(data.name_en).trim().toLowerCase(), money(purchase));
            nextRawByName.set(String(data.name_en).trim().toLowerCase(), purchase);
          }
        });
        barcodeSnap.forEach((item) => {
          const data = item.data() as BarcodeDoc;
          const product = data.product_id ? products.get(data.product_id) : null;
          if (product && data.barcode) {
            const purchase = toNumber(product.purchase_price);
            nextPriceByBarcode.set(String(data.barcode).trim(), money(purchase));
            nextRawByBarcode.set(String(data.barcode).trim(), purchase);
          }
        });
        priceByBarcode = nextPriceByBarcode;
        priceByName = nextPriceByName;
        rawByBarcode = nextRawByBarcode;
        rawByName = nextRawByName;
      } catch {
        // Keep UI usable when Firestore rules are not published yet.
      } finally {
        loading = false;
      }
    };

    const findProductId = async (name: string, barcode: string) => {
      const { db } = clientDb();
      if (barcode) {
        const barcodeSnap = await getDocs(query(collection(db, "product_barcodes"), where("barcode", "==", barcode)));
        const barcodeRow = barcodeSnap.docs[0]?.data() as BarcodeDoc | undefined;
        if (barcodeRow?.product_id) return barcodeRow.product_id;
      }
      if (name) {
        const productSnap = await getDocs(query(collection(db, "products"), where("name_en", "==", name)));
        if (productSnap.docs[0]?.id) return productSnap.docs[0].id;
      }
      return "";
    };

    const savePurchaseRate = async (name: string, barcode: string, rate: number) => {
      if (!rate) return false;
      const { db, auth } = clientDb();
      if (!auth.currentUser) return false;
      const productId = await findProductId(name, barcode);
      if (!productId) return false;
      await updateDoc(doc(db, "products", productId), { purchase_price: rate, updated_at: new Date().toISOString() });
      if (name) {
        priceByName.set(name.trim().toLowerCase(), money(rate));
        rawByName.set(name.trim().toLowerCase(), rate);
      }
      if (barcode) {
        priceByBarcode.set(barcode.trim(), money(rate));
        rawByBarcode.set(barcode.trim(), rate);
      }
      return true;
    };

    const retrySavePurchaseRate = (name: string, barcode: string, rate: number, attempts = 10) => {
      let count = 0;
      const run = async () => {
        count += 1;
        try {
          const ok = await savePurchaseRate(name, barcode, rate);
          if (ok) {
            await loadRates(true);
            return;
          }
        } catch {
          // Retry; the main product save may still be finishing.
        }
        if (count < attempts) window.setTimeout(run, 750);
      };
      window.setTimeout(run, 900);
    };

    const injectPurchaseRateField = async () => {
      const forms = Array.from(document.querySelectorAll<HTMLFormElement>(".action-form"));
      for (const form of forms) {
        const priceInput = form.querySelector<HTMLInputElement>('input[name="price"]');
        const mrpInput = form.querySelector<HTMLInputElement>('input[name="mrp"]');
        const nameInput = form.querySelector<HTMLInputElement>('input[name="name"]');
        if (!priceInput || !mrpInput || !nameInput) continue;

        await loadRates();
        if (!form.querySelector('input[name="purchase_rate"]')) {
          const barcodeInput = form.querySelector<HTMLInputElement>('input[name="barcode"]');
          const currentRate = rawByBarcode.get(barcodeInput?.value.trim() || "") || rawByName.get(nameInput.value.trim().toLowerCase()) || "";
          const row = document.createElement("div");
          row.className = "action-form-row alsa-purchase-rate-field";
          row.innerHTML = `
            <label>
              <span>Purchase rate <small>(only product page)</small></span>
              <div>
                <span style="font-weight:900;color:#7d8aa5;min-width:17px;text-align:center">₹</span>
                <input name="purchase_rate" type="number" min="0" step="0.01" placeholder="Cost price" value="${currentRate || ""}" />
              </div>
            </label>
          `;
          const priceRow = priceInput.closest(".action-form-row");
          if (priceRow?.parentElement) priceRow.parentElement.insertBefore(row, priceRow);
        }

        if (!form.dataset.purchaseRateListener) {
          form.dataset.purchaseRateListener = "true";
          form.addEventListener("submit", () => {
            const formData = new FormData(form);
            const rate = toNumber(formData.get("purchase_rate"));
            if (!rate) return;
            const productName = String(formData.get("name") || "").trim();
            const barcode = String(formData.get("barcode") || "").trim();
            retrySavePurchaseRate(productName, barcode, rate);
          });
        }
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

    const tick = () => {
      void injectColumn();
      void injectPurchaseRateField();
    };

    const interval = window.setInterval(tick, 900);
    const observer = new MutationObserver(tick);
    observer.observe(document.body, { childList: true, subtree: true });
    tick();
    return () => { window.clearInterval(interval); observer.disconnect(); };
  }, []);

  return null;
}
