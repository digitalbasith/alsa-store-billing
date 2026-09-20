"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getFirestore,
  increment,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type Firestore,
} from "firebase/firestore";

type Product = {
  id: string;
  name: string;
  barcode: string;
  category: string;
  price: number;
  mrp: number;
  stock: number;
  gst: number;
  active: boolean;
};

type CartItem = Product & { quantity: number };

type Sale = {
  id: string;
  invoiceNo: string;
  total: number;
  itemCount: number;
  createdAtMs: number;
};

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDoJZkKsXrwG7d7QsYBQhdO7IfGcOG8gws",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "alsa-store-billing.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "alsa-store-billing",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "alsa-store-billing.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "918214002690",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:918214002690:web:588127c30be3946574bf1b",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-ZGP48F4W4X",
};

function getFirebase(): { auth: ReturnType<typeof getAuth>; db: Firestore } {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  return { auth: getAuth(app), db: getFirestore(app) };
}

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value || 0);

function numberValue(form: FormData, key: string) {
  return Number(String(form.get(key) || "0")) || 0;
}

function timestampMs(value: unknown) {
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  return 0;
}

function AppStyles() {
  return <style>{`
    :root { color-scheme: light; }
    html, body { margin: 0 !important; background: #eef2f8 !important; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important; }
    button, input { font: inherit; box-sizing: border-box; }
    .fb-page { min-height: 100vh; padding: 18px; background: linear-gradient(135deg, #f7f9ff 0%, #edf2fb 100%); color: #172033; }
    .fb-auth-wrap { min-height: 100vh; display: grid; place-items: start center; padding-top: 42px; }
    .fb-auth-card { width: min(100%, 430px); padding: 22px; border-radius: 24px; background: #ffffff; box-shadow: 0 24px 70px rgba(23, 32, 51, .14); border: 1px solid #e5e9f3; }
    .fb-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
    .fb-mark { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 16px; background: linear-gradient(135deg, #3153c6, #6d7cff); color: #fff; font-weight: 900; letter-spacing: .05em; flex: 0 0 auto; }
    .fb-brand p { margin: 0 0 3px; color: #64708a; font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .fb-brand h1 { margin: 0; font-size: 24px; line-height: 1.1; letter-spacing: -.04em; }
    .fb-warning { margin: 0 0 18px; padding: 11px 12px; border-radius: 14px; background: #eef7ff; color: #275581; font-size: 13px; line-height: 1.45; }
    .fb-form { display: grid; gap: 12px; }
    .fb-label { display: grid; gap: 6px; color: #4b566c; font-size: 12px; font-weight: 800; }
    .fb-input { width: 100%; height: 46px; padding: 0 13px; border-radius: 13px; border: 1px solid #dce2ef; background: #f9fbff; color: #172033; outline: none; }
    .fb-input:focus { border-color: #3153c6; box-shadow: 0 0 0 4px rgba(49, 83, 198, .1); background: #fff; }
    .fb-primary { min-height: 47px; border: 0; border-radius: 14px; background: linear-gradient(135deg, #3153c6, #263f9e); color: #fff; font-weight: 900; cursor: pointer; box-shadow: 0 14px 24px rgba(49,83,198,.22); }
    .fb-primary:disabled { opacity: .65; cursor: wait; }
    .fb-link { margin-top: 12px; width: 100%; min-height: 42px; border: 0; background: transparent; color: #3153c6; font-weight: 850; cursor: pointer; }
    .fb-error { margin: 0; color: #b4233b; font-weight: 800; font-size: 12px; }
    .fb-top { max-width: 1180px; margin: 0 auto 18px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px; border-radius: 22px; background: #fff; border: 1px solid #e5e9f3; box-shadow: 0 14px 38px rgba(23,32,51,.08); }
    .fb-signout { height: 42px; padding: 0 14px; border-radius: 13px; border: 1px solid #dce2ef; background: #fff; color: #172033; font-weight: 850; cursor: pointer; }
    .fb-grid { max-width: 1180px; margin: 0 auto 18px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .fb-metric { padding: 15px; border-radius: 18px; background: #fff; border: 1px solid #e5e9f3; box-shadow: 0 10px 28px rgba(23,32,51,.06); }
    .fb-metric span { display: block; color: #64708a; font-size: 12px; font-weight: 800; margin-bottom: 6px; }
    .fb-metric strong { font-size: 22px; letter-spacing: -.04em; }
    .fb-message { max-width: 1180px; margin: 0 auto 18px; padding: 12px 14px; border-radius: 15px; background: #eaf9f3; color: #126b4b; font-weight: 800; }
    .fb-layout { max-width: 1180px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1.12fr) minmax(320px, .88fr); gap: 14px; align-items: start; }
    .fb-panel { padding: 16px; border-radius: 22px; background: #fff; border: 1px solid #e5e9f3; box-shadow: 0 14px 34px rgba(23,32,51,.07); min-width: 0; }
    .fb-panel h2 { margin: 0 0 14px; font-size: 18px; letter-spacing: -.03em; }
    .fb-product-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .fb-product-form .wide { grid-column: 1 / -1; }
    .fb-product-form button { grid-column: 1 / -1; }
    .fb-search { width: 100%; margin-bottom: 10px; }
    .fb-list { display: grid; gap: 8px; max-height: 520px; overflow: auto; padding-right: 2px; }
    .fb-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto 38px; align-items: center; gap: 10px; padding: 10px; border-radius: 15px; background: #f8faff; border: 1px solid #edf1f8; }
    .fb-row-main { min-width: 0; border: 0; background: transparent; text-align: left; cursor: pointer; padding: 0; }
    .fb-row-main strong, .fb-row-main span { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .fb-row-main strong { font-size: 14px; }
    .fb-row-main span { margin-top: 3px; color: #64708a; font-size: 12px; }
    .fb-price, .fb-stock { font-weight: 850; white-space: nowrap; font-size: 13px; }
    .fb-stock { color: #64708a; }
    .fb-danger { width: 36px; height: 36px; border-radius: 12px; border: 1px solid #ffd2da; background: #fff5f7; color: #bc2842; font-weight: 900; cursor: pointer; }
    .fb-cart { position: sticky; top: 14px; }
    .fb-cart-lines { display: grid; gap: 8px; }
    .fb-cart-line { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 8px; padding: 9px; border-radius: 14px; background: #f8faff; border: 1px solid #edf1f8; }
    .fb-cart-line > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 800; }
    .fb-qty { display: inline-flex; align-items: center; gap: 7px; }
    .fb-qty button { width: 28px; height: 28px; border-radius: 9px; border: 1px solid #dce2ef; background: #fff; font-weight: 900; }
    .fb-total { display: flex; justify-content: space-between; gap: 10px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #edf1f8; color: #64708a; font-weight: 850; }
    .fb-total.grand { color: #172033; font-size: 20px; }
    .fb-empty { margin: 10px 0 0; color: #7b8498; font-size: 13px; }
    .fb-sales { margin-top: 14px; }
    .fb-sale-line { display: flex; justify-content: space-between; gap: 10px; padding: 10px 0; border-bottom: 1px solid #edf1f8; font-size: 13px; }
    @media (max-width: 780px) {
      .fb-page { padding: 12px; }
      .fb-auth-wrap { place-items: start stretch; padding-top: 14px; }
      .fb-auth-card { width: 100%; border-radius: 20px; padding: 18px; }
      .fb-top { align-items: flex-start; border-radius: 18px; }
      .fb-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .fb-layout { grid-template-columns: 1fr; gap: 12px; }
      .fb-product-form { grid-template-columns: 1fr; }
      .fb-row { grid-template-columns: minmax(0, 1fr) auto 36px; }
      .fb-stock { display: none; }
      .fb-cart { position: static; }
    }
    @media (max-width: 430px) {
      .fb-brand h1 { font-size: 21px; }
      .fb-grid { grid-template-columns: 1fr 1fr; }
      .fb-metric { padding: 12px; }
      .fb-metric strong { font-size: 18px; }
      .fb-row { gap: 8px; padding: 9px; }
      .fb-price { font-size: 12px; }
      .fb-top { padding: 12px; }
      .fb-panel { padding: 13px; }
    }
  `}</style>;
}

export default function AlsaStoreBilling() {
  const [{ auth, db }] = useState(getFirebase);
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("owner@alsastore.in");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [queryText, setQueryText] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => onAuthStateChanged(auth, setUser), [auth]);

  useEffect(() => {
    if (!user) {
      setProducts([]);
      setSales([]);
      setCart([]);
      return;
    }

    const productQuery = query(collection(db, "products"), where("ownerId", "==", user.uid));
    const salesQuery = query(collection(db, "sales"), where("ownerId", "==", user.uid));

    const stopProducts = onSnapshot(productQuery, (snapshot) => {
      setProducts(snapshot.docs.map((item) => {
        const data = item.data();
        return {
          id: item.id,
          name: String(data.name || ""),
          barcode: String(data.barcode || ""),
          category: String(data.category || "General"),
          price: Number(data.price || 0),
          mrp: Number(data.mrp || data.price || 0),
          stock: Number(data.stock || 0),
          gst: Number(data.gst || 0),
          active: data.active !== false,
        };
      }).filter((product) => product.active).sort((a, b) => a.name.localeCompare(b.name)));
    });

    const stopSales = onSnapshot(salesQuery, (snapshot) => {
      setSales(snapshot.docs.map((item) => {
        const data = item.data();
        return {
          id: item.id,
          invoiceNo: String(data.invoiceNo || item.id),
          total: Number(data.total || 0),
          itemCount: Number(data.itemCount || 0),
          createdAtMs: timestampMs(data.createdAt),
        };
      }).sort((a, b) => b.createdAtMs - a.createdAtMs).slice(0, 10));
    });

    return () => {
      stopProducts();
      stopSales();
    };
  }, [db, user]);

  const filteredProducts = useMemo(() => {
    const text = queryText.trim().toLowerCase();
    if (!text) return products;
    return products.filter((product) => `${product.name} ${product.barcode} ${product.category}`.toLowerCase().includes(text));
  }, [products, queryText]);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const gstTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity * item.gst) / (100 + item.gst), 0);
  const lowStock = products.filter((product) => product.stock <= 5).length;

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setAuthError("");
    try {
      if (authMode === "signup") await createUserWithEmailAndPassword(auth, email.trim(), password);
      else await signInWithEmailAndPassword(auth, email.trim(), password);
      setMessage("Firebase login ready. Alsa data is isolated from Nila.");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function addProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    if (!name) return;
    setBusy(true);
    try {
      await addDoc(collection(db, "products"), {
        ownerId: user.uid,
        storeName: "Alsa Store",
        name,
        barcode: String(form.get("barcode") || "").trim(),
        category: String(form.get("category") || "General").trim() || "General",
        price: numberValue(form, "price"),
        mrp: numberValue(form, "mrp") || numberValue(form, "price"),
        stock: Math.round(numberValue(form, "stock")),
        gst: numberValue(form, "gst"),
        active: true,
        createdAt: serverTimestamp(),
      });
      event.currentTarget.reset();
      setMessage("Product saved to Firebase only. It will not sync with Nila.");
    } finally {
      setBusy(false);
    }
  }

  function addToCart(product: Product) {
    setCart((current) => {
      const exists = current.find((item) => item.id === product.id);
      if (exists) return current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      return [...current, { ...product, quantity: 1 }];
    });
  }

  async function deleteProduct(product: Product) {
    if (!user) return;
    if (!confirm(`Delete ${product.name}?`)) return;
    await updateDoc(doc(db, "products", product.id), { active: false, deletedAt: serverTimestamp() });
    setCart((current) => current.filter((item) => item.id !== product.id));
    setMessage("Product deleted from Alsa Firebase database.");
  }

  async function completeSale() {
    if (!user || !cart.length || busy) return;
    setBusy(true);
    try {
      const invoiceNo = `AS-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(Date.now()).slice(-5)}`;
      const saleRef = doc(collection(db, "sales"));
      await runTransaction(db, async (transaction) => {
        for (const item of cart) {
          const productRef = doc(db, "products", item.id);
          transaction.update(productRef, { stock: increment(-item.quantity), updatedAt: serverTimestamp() });
        }
        transaction.set(saleRef, {
          ownerId: user.uid,
          invoiceNo,
          total: subtotal,
          gstTotal,
          itemCount: cart.reduce((sum, item) => sum + item.quantity, 0),
          items: cart.map((item) => ({ productId: item.id, name: item.name, price: item.price, quantity: item.quantity, gst: item.gst })),
          createdAt: serverTimestamp(),
        });
      });
      setCart([]);
      setMessage(`Sale ${invoiceNo} saved to Firebase.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sale failed");
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <main className="fb-page">
        <AppStyles />
        <section className="fb-auth-wrap">
          <div className="fb-auth-card">
            <div className="fb-brand">
              <span className="fb-mark">AS</span>
              <div><p>Alsa Store Billing</p><h1>Firebase Login</h1></div>
            </div>
            <p className="fb-warning">This version uses Firebase only. It will not connect to Nila/Supabase.</p>
            <form onSubmit={handleAuth} className="fb-form">
              <label className="fb-label">Email<input className="fb-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
              <label className="fb-label">Password<input className="fb-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required /></label>
              {authError && <p className="fb-error">{authError}</p>}
              <button className="fb-primary" type="submit" disabled={busy}>{busy ? "Please wait..." : authMode === "signup" ? "Create Alsa account" : "Sign in"}</button>
            </form>
            <button className="fb-link" onClick={() => setAuthMode(authMode === "signup" ? "signin" : "signup")}>{authMode === "signup" ? "Already have an account? Sign in" : "New account? Create owner login"}</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="fb-page">
      <AppStyles />
      <header className="fb-top">
        <div className="fb-brand"><span className="fb-mark">AS</span><div><p>Firebase isolated</p><h1>Alsa Store Billing</h1></div></div>
        <button className="fb-signout" onClick={() => signOut(auth)}>Sign out</button>
      </header>

      <section className="fb-grid">
        <article className="fb-metric"><span>Products</span><strong>{products.length}</strong></article>
        <article className="fb-metric"><span>Low stock</span><strong>{lowStock}</strong></article>
        <article className="fb-metric"><span>Current bill</span><strong>{money(subtotal)}</strong></article>
        <article className="fb-metric"><span>Recent sales</span><strong>{sales.length}</strong></article>
      </section>

      {message && <div className="fb-message">{message}</div>}

      <section className="fb-layout">
        <div className="fb-panel">
          <h2>Add product</h2>
          <form onSubmit={addProduct} className="fb-product-form">
            <input className="fb-input wide" name="name" placeholder="Product name" required />
            <input className="fb-input" name="barcode" placeholder="Barcode" />
            <input className="fb-input" name="category" placeholder="Category" defaultValue="General" />
            <input className="fb-input" name="mrp" placeholder="MRP" type="number" step="0.01" />
            <input className="fb-input" name="price" placeholder="Sale price" type="number" step="0.01" required />
            <input className="fb-input" name="stock" placeholder="Stock" type="number" required />
            <input className="fb-input" name="gst" placeholder="GST %" type="number" step="0.01" defaultValue="0" />
            <button className="fb-primary" type="submit" disabled={busy}>Save to Firebase</button>
          </form>
        </div>

        <aside className="fb-panel fb-cart">
          <h2>Current bill</h2>
          <div className="fb-cart-lines">
            {cart.map((item) => (
              <div className="fb-cart-line" key={item.id}>
                <span>{item.name}</span>
                <div className="fb-qty"><button onClick={() => setCart((current) => current.map((row) => row.id === item.id ? { ...row, quantity: Math.max(1, row.quantity - 1) } : row))}>−</button><strong>{item.quantity}</strong><button onClick={() => addToCart(item)}>+</button></div>
                <strong>{money(item.price * item.quantity)}</strong>
              </div>
            ))}
          </div>
          {!cart.length && <p className="fb-empty">Tap a product to add it to bill.</p>}
          <div className="fb-total"><span>GST included</span><strong>{money(gstTotal)}</strong></div>
          <div className="fb-total grand"><span>Total</span><strong>{money(subtotal)}</strong></div>
          <button className="fb-primary" style={{ width: "100%", marginTop: 14 }} onClick={completeSale} disabled={!cart.length || busy}>Complete sale</button>
        </aside>

        <div className="fb-panel">
          <h2>Products</h2>
          <input className="fb-input fb-search" value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="Search name or barcode" />
          <div className="fb-list">
            {filteredProducts.map((product) => (
              <div className="fb-row" key={product.id}>
                <button className="fb-row-main" onClick={() => addToCart(product)}>
                  <strong>{product.name}</strong><span>{product.category} · {product.barcode || "No barcode"}</span>
                </button>
                <span className="fb-price">{money(product.price)}</span>
                <span className="fb-stock">Stock {product.stock}</span>
                <button className="fb-danger" onClick={() => deleteProduct(product)} title="Delete">×</button>
              </div>
            ))}
            {!filteredProducts.length && <p className="fb-empty">No products yet. Add your first Alsa product.</p>}
          </div>
        </div>

        <div className="fb-panel fb-sales">
          <h2>Recent Firebase sales</h2>
          {sales.map((sale) => <div className="fb-sale-line" key={sale.id}><span>{sale.invoiceNo}</span><strong>{money(sale.total)}</strong></div>)}
          {!sales.length && <p className="fb-empty">No sales saved yet.</p>}
        </div>
      </section>
    </main>
  );
}
