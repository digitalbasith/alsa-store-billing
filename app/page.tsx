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
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type Firestore,
} from "firebase/firestore";
import { Barcode, LogOut, PackagePlus, ReceiptIndianRupee, Trash2 } from "lucide-react";

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
  createdAt?: unknown;
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

function getFirebase() {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  return { auth: getAuth(app), db: getFirestore(app) };
}

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value || 0);

function numberValue(form: FormData, key: string) {
  return Number(String(form.get(key) || "0")) || 0;
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

    const productQuery = query(
      collection(db, "products"),
      where("ownerId", "==", user.uid),
      where("active", "==", true),
      orderBy("name"),
    );
    const salesQuery = query(
      collection(db, "sales"),
      where("ownerId", "==", user.uid),
      orderBy("createdAt", "desc"),
    );

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
      }));
    });

    const stopSales = onSnapshot(salesQuery, (snapshot) => {
      setSales(snapshot.docs.slice(0, 10).map((item) => {
        const data = item.data();
        return {
          id: item.id,
          invoiceNo: String(data.invoiceNo || item.id),
          total: Number(data.total || 0),
          itemCount: Number(data.itemCount || 0),
          createdAt: data.createdAt,
        };
      }));
    });

    return () => {
      stopProducts();
      stopSales();
    };
  }, [db, user]);

  const filteredProducts = useMemo(() => {
    const text = queryText.trim().toLowerCase();
    if (!text) return products;
    return products.filter((product) =>
      `${product.name} ${product.barcode} ${product.category}`.toLowerCase().includes(text),
    );
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
      <main className="firebase-page">
        <section className="firebase-auth-card">
          <div className="brand-lockup"><span className="brand-mark">AS</span><div><p>Alsa Store Billing</p><h1>Firebase Login</h1></div></div>
          <p className="sync-warning">This version uses Firebase only. It will not connect to Nila/Supabase.</p>
          <form onSubmit={handleAuth} className="firebase-form">
            <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required /></label>
            {authError && <p className="form-error">{authError}</p>}
            <button type="submit" disabled={busy}>{busy ? "Please wait..." : authMode === "signup" ? "Create Alsa account" : "Sign in"}</button>
          </form>
          <button className="link-button" onClick={() => setAuthMode(authMode === "signup" ? "signin" : "signup")}>{authMode === "signup" ? "Already have an account? Sign in" : "New account? Create owner login"}</button>
        </section>
      </main>
    );
  }

  return (
    <main className="firebase-page">
      <header className="firebase-header">
        <div className="brand-lockup"><span className="brand-mark">AS</span><div><p>Firebase isolated</p><h1>Alsa Store Billing</h1></div></div>
        <button className="outline-button" onClick={() => signOut(auth)}><LogOut size={16} /> Sign out</button>
      </header>

      <section className="metric-grid">
        <article><span>Products</span><strong>{products.length}</strong></article>
        <article><span>Low stock</span><strong>{lowStock}</strong></article>
        <article><span>Current bill</span><strong>{money(subtotal)}</strong></article>
        <article><span>Recent sales</span><strong>{sales.length}</strong></article>
      </section>

      {message && <div className="firebase-message">{message}</div>}

      <section className="firebase-layout">
        <div className="panel-card">
          <h2><PackagePlus size={20} /> Add product</h2>
          <form onSubmit={addProduct} className="product-form">
            <input name="name" placeholder="Product name" required />
            <input name="barcode" placeholder="Barcode" />
            <input name="category" placeholder="Category" defaultValue="General" />
            <input name="mrp" placeholder="MRP" type="number" step="0.01" />
            <input name="price" placeholder="Sale price" type="number" step="0.01" required />
            <input name="stock" placeholder="Stock" type="number" required />
            <input name="gst" placeholder="GST %" type="number" step="0.01" defaultValue="0" />
            <button type="submit" disabled={busy}>Save to Firebase</button>
          </form>
        </div>

        <div className="panel-card products-card">
          <div className="panel-headline"><h2><Barcode size={20} /> Products</h2><input value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="Search name or barcode" /></div>
          <div className="firebase-table">
            {filteredProducts.map((product) => (
              <div className="firebase-row" key={product.id}>
                <button className="row-main" onClick={() => addToCart(product)}>
                  <strong>{product.name}</strong><span>{product.category} · {product.barcode || "No barcode"}</span>
                </button>
                <span>{money(product.price)}</span>
                <span>Stock {product.stock}</span>
                <button className="icon-danger" onClick={() => deleteProduct(product)} title="Delete"><Trash2 size={16} /></button>
              </div>
            ))}
            {!filteredProducts.length && <p className="empty-copy">No products yet. Add your first Alsa product.</p>}
          </div>
        </div>

        <div className="panel-card cart-card">
          <h2><ReceiptIndianRupee size={20} /> Current bill</h2>
          {cart.map((item) => (
            <div className="cart-line" key={item.id}>
              <span>{item.name}</span>
              <div><button onClick={() => setCart((current) => current.map((row) => row.id === item.id ? { ...row, quantity: Math.max(1, row.quantity - 1) } : row))}>−</button><strong>{item.quantity}</strong><button onClick={() => addToCart(item)}>+</button></div>
              <strong>{money(item.price * item.quantity)}</strong>
            </div>
          ))}
          {!cart.length && <p className="empty-copy">Tap a product to add it to bill.</p>}
          <div className="bill-total"><span>GST included</span><strong>{money(gstTotal)}</strong></div>
          <div className="bill-total grand"><span>Total</span><strong>{money(subtotal)}</strong></div>
          <button className="checkout-button" onClick={completeSale} disabled={!cart.length || busy}>Complete sale</button>
        </div>

        <div className="panel-card">
          <h2>Recent Firebase sales</h2>
          {sales.map((sale) => <div className="sale-line" key={sale.id}><span>{sale.invoiceNo}</span><strong>{money(sale.total)}</strong></div>)}
          {!sales.length && <p className="empty-copy">No sales saved yet.</p>}
        </div>
      </section>
    </main>
  );
}
