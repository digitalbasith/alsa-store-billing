import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updatePassword,
  updateProfile,
  type Auth,
  type User,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  increment,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";

export type Row = Record<string, any>;
export type CloudResult<T = any> = { data: T | null; error: Error | null };

type Filter = { field: string; value: any; op: "eq" | "in" };

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDoJZkKsXrwG7d7QsYBQhdO7IfGcOG8gws",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "alsa-store-billing.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "alsa-store-billing",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "alsa-store-billing.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "918214002690",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:918214002690:web:588127c30be3946574bf1b",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-ZGP48F4W4X",
};

let cachedClient: FirebaseCompatClient | null = null;

const nowIso = () => new Date().toISOString();
const safeNumber = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const asString = (value: unknown) => String(value ?? "");
const toError = (error: unknown) => error instanceof Error ? error : new Error(String(error || "Firebase operation failed"));
const clean = (row: Row) => Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
const idFor = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

function userShape(user: User | null) {
  if (!user) return null;
  return { id: user.uid, uid: user.uid, email: user.email, user_metadata: { full_name: user.displayName || user.email?.split("@")[0] || "Alsa User" } };
}

function normalize(value: any): any {
  if (!value) return value;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    const next: Row = {};
    for (const [key, nested] of Object.entries(value)) next[key] = normalize(nested);
    return next;
  }
  return value;
}

function rowFromDoc(snapshot: any): Row {
  const data = normalize(snapshot.data?.() || {});
  return { id: snapshot.id, ...data };
}

function matches(row: Row, filters: Filter[]) {
  return filters.every((filter) => {
    const actual = filter.field === "id" ? row.id : row[filter.field];
    if (filter.op === "in") return Array.isArray(filter.value) && filter.value.includes(actual);
    return String(actual ?? "") === String(filter.value ?? "");
  });
}

async function allRows(db: Firestore, table: string) {
  const snap = await getDocs(query(collection(db, table)));
  return snap.docs.map(rowFromDoc);
}

class FirebaseQueryBuilder<T = any> implements PromiseLike<CloudResult<T>> {
  private filters: Filter[] = [];
  private orderField = "";
  private ascending = true;
  private maxRows = 0;
  private mode: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: any = null;
  private wantSingle = false;
  private wantMaybeSingle = false;
  private conflictFields: string[] = [];

  constructor(private client: FirebaseCompatClient, private table: string) {}

  select(_columns?: string) { this.mode = this.mode || "select"; return this; }
  eq(field: string, value: any) { this.filters.push({ field, value, op: "eq" }); return this; }
  in(field: string, value: any[]) { this.filters.push({ field, value, op: "in" }); return this; }
  order(field: string, options?: { ascending?: boolean }) { this.orderField = field; this.ascending = options?.ascending !== false; return this; }
  limit(count: number) { this.maxRows = count; return this; }
  single() { this.wantSingle = true; return this; }
  maybeSingle() { this.wantMaybeSingle = true; return this; }
  insert(payload: Row | Row[]) { this.mode = "insert"; this.payload = payload; return this; }
  update(payload: Row) { this.mode = "update"; this.payload = payload; return this; }
  delete() { this.mode = "delete"; return this; }
  upsert(payload: Row | Row[], options?: { onConflict?: string }) { this.mode = "upsert"; this.payload = payload; this.conflictFields = (options?.onConflict || "").split(",").map((v) => v.trim()).filter(Boolean); return this; }

  then<TResult1 = CloudResult<T>, TResult2 = never>(resolve?: ((value: CloudResult<T>) => TResult1 | PromiseLike<TResult1>) | null, reject?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null) {
    return this.execute().then(resolve, reject);
  }

  private async execute(): Promise<CloudResult<any>> {
    try {
      let data: any;
      if (this.mode === "insert") data = await this.insertRows();
      else if (this.mode === "update") data = await this.updateRows();
      else if (this.mode === "delete") data = await this.deleteRows();
      else if (this.mode === "upsert") data = await this.upsertRows();
      else data = await this.selectRows();
      if (this.wantSingle) data = Array.isArray(data) ? data[0] ?? null : data;
      if (this.wantMaybeSingle) data = Array.isArray(data) ? data[0] ?? null : data;
      return { data, error: null };
    } catch (error) {
      return { data: null, error: toError(error) };
    }
  }

  private async selectRows() {
    let rows = (await allRows(this.client.db, this.table)).filter((row) => matches(row, this.filters));
    if (this.table === "products") rows = await this.client.decorateProducts(rows);
    if (this.table === "purchases") rows = await this.client.decoratePurchases(rows);
    if (this.table === "store_members") rows = await this.client.decorateMembers(rows);
    if (this.table === "sale_items") rows = await this.client.decorateSaleItems(rows);
    if (this.table === "purchase_items") rows = await this.client.decoratePurchaseItems(rows);
    if (this.table === "sale_returns") rows = await this.client.decorateSaleReturns(rows);
    if (this.table === "purchase_returns") rows = await this.client.decoratePurchaseReturns(rows);
    if (this.orderField) rows.sort((a, b) => String(a[this.orderField] ?? "").localeCompare(String(b[this.orderField] ?? "")) * (this.ascending ? 1 : -1));
    if (this.maxRows) rows = rows.slice(0, this.maxRows);
    return rows;
  }

  private async insertRows() {
    const items = Array.isArray(this.payload) ? this.payload : [this.payload];
    const saved: Row[] = [];
    for (const item of items) {
      const ref = await addDoc(collection(this.client.db, this.table), clean({ ...item, created_at: item.created_at || nowIso(), active: item.active ?? true }));
      saved.push({ id: ref.id, ...item });
    }
    return Array.isArray(this.payload) ? saved : saved[0];
  }

  private async updateRows() {
    const rows = (await allRows(this.client.db, this.table)).filter((row) => matches(row, this.filters));
    for (const row of rows) await updateDoc(doc(this.client.db, this.table, row.id), clean({ ...this.payload, updated_at: nowIso() }));
    return rows.map((row) => ({ ...row, ...this.payload }));
  }

  private async deleteRows() {
    const rows = (await allRows(this.client.db, this.table)).filter((row) => matches(row, this.filters));
    for (const row of rows) await deleteDoc(doc(this.client.db, this.table, row.id));
    return rows;
  }

  private async upsertRows() {
    const items = Array.isArray(this.payload) ? this.payload : [this.payload];
    const existing = await allRows(this.client.db, this.table);
    const saved: Row[] = [];
    for (const item of items) {
      const fields = this.conflictFields.length ? this.conflictFields : ["id"];
      const hit = item.id ? existing.find((row) => row.id === item.id) : existing.find((row) => fields.every((field) => String(row[field] ?? "") === String(item[field] ?? "")));
      const ref = hit ? doc(this.client.db, this.table, hit.id) : doc(collection(this.client.db, this.table));
      const payload = clean({ ...item, id: ref.id, active: item.active ?? true, updated_at: nowIso(), created_at: item.created_at || hit?.created_at || nowIso() });
      await setDoc(ref, payload, { merge: true });
      saved.push({ ...payload, id: ref.id });
    }
    return Array.isArray(this.payload) ? saved : saved[0];
  }
}

export class FirebaseCompatClient {
  app: FirebaseApp;
  authClient: Auth;
  db: Firestore;
  auth: any;
  functions: any;

  constructor() {
    this.app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    this.authClient = getAuth(this.app);
    this.db = getFirestore(this.app);
    this.auth = {
      signUp: async ({ email, password, options }: { email: string; password: string; options?: any }) => {
        try {
          const result = await createUserWithEmailAndPassword(this.authClient, email, password);
          if (options?.data?.full_name) await updateProfile(result.user, { displayName: options.data.full_name });
          return { data: { user: userShape(result.user), session: { user: userShape(result.user) } }, error: null };
        } catch (error) { return { data: {}, error: toError(error) }; }
      },
      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        try { const result = await signInWithEmailAndPassword(this.authClient, email, password); return { data: { user: userShape(result.user), session: { user: userShape(result.user) } }, error: null }; }
        catch (error) { return { data: {}, error: toError(error) }; }
      },
      getSession: async () => ({ data: { session: this.authClient.currentUser ? { user: userShape(this.authClient.currentUser) } : null }, error: null }),
      getUser: async () => ({ data: { user: userShape(this.authClient.currentUser) }, error: this.authClient.currentUser ? null : new Error("Please sign in again") }),
      signOut: async () => { await firebaseSignOut(this.authClient); return { error: null }; },
      updateUser: async ({ password }: { password?: string }) => { try { if (password && this.authClient.currentUser) await updatePassword(this.authClient.currentUser, password); return { data: { user: userShape(this.authClient.currentUser) }, error: null }; } catch (error) { return { data: {}, error: toError(error) }; } },
      onAuthStateChange: (callback: (event: string, session: any) => void) => {
        let seen = false;
        const unsubscribe = onAuthStateChanged(this.authClient, (user) => { callback(user ? (seen ? "USER_UPDATED" : "SIGNED_IN") : "SIGNED_OUT", user ? { user: userShape(user) } : null); seen = true; });
        return { data: { subscription: { unsubscribe } } };
      },
    };
    this.functions = { invoke: async (name: string, args: any) => {
      try { if (name !== "invite-staff") throw new Error(`Unknown Firebase operation: ${name}`); return { data: await this.inviteStaff(args?.body || {}), error: null }; }
      catch (error) { return { data: {}, error: toError(error) }; }
    } };
  }

  from(table: string) { return new FirebaseQueryBuilder(this, table); }

  async rpc(name: string, args: Row = {}): Promise<CloudResult<any>> {
    try {
      const handlers: Record<string, () => Promise<any> | any> = {
        nila_bootstrap_status: () => true,
        create_store: () => this.createStore(args),
        profit_summary: () => this.profitSummary(asString(args.p_store_id)),
        complete_sale: () => this.completeSale(args),
        undo_sale_30s: () => this.undoSale(args),
        receive_purchase: () => this.receivePurchase(args),
        process_sale_return: () => this.processSaleReturn(args),
        cancel_sale: () => this.cancelSale(args),
        process_purchase_return: () => this.processPurchaseReturn(args),
        cancel_purchase: () => this.cancelPurchase(args),
        post_account_entry: () => this.postAccountEntry(args),
        cancel_account_entry: () => this.cancelAccountEntry(args),
        adjust_stock: () => this.adjustStock(args),
        repack_stock: () => this.repackStock(args),
        merge_products: () => this.mergeProducts(args),
        close_business_day: () => this.closeBusinessDay(args),
        save_business_document: () => this.saveBusinessDocument(args),
      };
      if (!handlers[name]) throw new Error(`Firebase operation '${name}' is not implemented`);
      return { data: await handlers[name](), error: null };
    } catch (error) { return { data: null, error: toError(error) }; }
  }

  async decorateProducts(rows: Row[]) {
    const categories = await allRows(this.db, "categories");
    const barcodes = await allRows(this.db, "product_barcodes");
    return rows.map((row) => ({ ...row, categories: categories.find((c) => c.id === row.category_id) || null, product_barcodes: barcodes.filter((b) => b.product_id === row.id) }));
  }
  async decoratePurchases(rows: Row[]) { const suppliers = await allRows(this.db, "suppliers"); return rows.map((row) => ({ ...row, suppliers: suppliers.find((s) => s.id === row.supplier_id) || null })); }
  async decorateMembers(rows: Row[]) { const stores = await allRows(this.db, "stores"); return rows.map((row) => ({ ...row, stores: stores.find((s) => s.id === row.store_id) || null })); }
  async decorateSaleItems(rows: Row[]) { return rows; }
  async decoratePurchaseItems(rows: Row[]) { const products = await allRows(this.db, "products"); return rows.map((row) => ({ ...row, products: products.find((p) => p.id === row.product_id) || null })); }
  async decorateSaleReturns(rows: Row[]) { const sales = await allRows(this.db, "sales"); return rows.map((row) => ({ ...row, sales: sales.find((s) => s.id === row.sale_id) || null })); }
  async decoratePurchaseReturns(rows: Row[]) { const purchases = await allRows(this.db, "purchases"); return rows.map((row) => ({ ...row, purchases: purchases.find((p) => p.id === row.purchase_id) || null })); }

  private async createStore(args: Row) {
    const user = this.authClient.currentUser;
    if (!user) throw new Error("Please sign in again");
    const storeRef = doc(collection(this.db, "stores"));
    const profile = { name: asString(args.store_name || "Alsa Store"), gstin: args.store_gstin || null, phone: args.store_phone || null, email: user.email || null, address: {}, invoice_prefix: "AS", active: true, created_at: nowIso() };
    await setDoc(storeRef, profile);
    await setDoc(doc(this.db, "store_members", `${storeRef.id}_${user.uid}`), { store_id: storeRef.id, user_id: user.uid, email: user.email, display_name: user.displayName || user.email?.split("@")[0] || "Owner", role: "super_admin", active: true, created_at: nowIso() });
    await setDoc(doc(this.db, "store_settings", storeRef.id), { store_id: storeRef.id, language: "en", tax_inclusive: true, low_stock_alerts: true, expiry_alert_days: 30, loyalty_enabled: false, loyalty_points_per_100: 1, receipt_footer_en: "Thank you. Visit again!", receipt_footer_ta: "நன்றி. மீண்டும் வருக!", invoice_template: "thermal", created_at: nowIso() }, { merge: true });
    return storeRef.id;
  }

  private async profitSummary(storeId: string) {
    const sales = (await allRows(this.db, "sales")).filter((row) => row.store_id === storeId && row.status !== "cancelled" && row.status !== "undone");
    const saleItems = (await allRows(this.db, "sale_items")).filter((row) => row.store_id === storeId);
    const revenue = sales.reduce((sum, row) => sum + safeNumber(row.grand_total), 0);
    const cost = saleItems.reduce((sum, row) => sum + safeNumber(row.cost_total), 0);
    const gross = revenue - cost;
    return { sales: revenue, cost, gross_profit: gross, margin_percent: revenue ? Number(((gross / revenue) * 100).toFixed(2)) : 0 };
  }

  private async completeSale(args: Row) {
    const storeId = asString(args.p_store_id);
    const items = Array.isArray(args.p_items) ? args.p_items : [];
    if (!storeId || !items.length) throw new Error("Cart is empty");
    const saleRef = doc(collection(this.db, "sales"));
    const invoiceNo = `AS-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(Date.now()).slice(-5)}`;
    let subtotal = 0, tax = 0, cost = 0;
    await runTransaction(this.db, async (tx) => {
      const productDocs = await Promise.all(items.map((item: Row) => tx.get(doc(this.db, "products", asString(item.product_id)))));
      productDocs.forEach((snap, index) => {
        if (!snap.exists()) throw new Error("Product not found");
        const product = snap.data() as Row;
        const qty = Math.max(1, safeNumber(items[index].quantity));
        const price = safeNumber(product.selling_price);
        subtotal += price * qty;
        tax += (price * qty * safeNumber(product.gst_rate)) / (100 + safeNumber(product.gst_rate));
        cost += safeNumber(product.purchase_price) * qty;
        tx.update(snap.ref, { current_stock: increment(-qty), updated_at: nowIso() });
        const itemRef = doc(collection(this.db, "sale_items"));
        tx.set(itemRef, { id: itemRef.id, store_id: storeId, sale_id: saleRef.id, product_id: snap.id, product_name: product.name_en, quantity: qty, unit_price: price, gst_rate: safeNumber(product.gst_rate), line_total: price * qty, cost_total: safeNumber(product.purchase_price) * qty, created_at: nowIso() });
      });
      const discount = safeNumber(args.p_discount);
      const total = Number((subtotal - discount).toFixed(2));
      tx.set(saleRef, { id: saleRef.id, store_id: storeId, invoice_no: invoiceNo, subtotal, tax_total: tax, discount_total: discount, grand_total: total, paid_total: total, balance_due: 0, item_count: items.length, status: "completed", created_at: nowIso() });
    });
    return { sale_id: saleRef.id, invoice_no: invoiceNo };
  }

  private async undoSale(args: Row) {
    const saleId = asString(args.p_sale_id);
    const storeId = asString(args.p_store_id);
    const items = (await allRows(this.db, "sale_items")).filter((row) => row.sale_id === saleId && row.store_id === storeId);
    await runTransaction(this.db, async (tx) => {
      tx.update(doc(this.db, "sales", saleId), { status: "undone", updated_at: nowIso() });
      items.forEach((item) => tx.update(doc(this.db, "products", item.product_id), { current_stock: increment(safeNumber(item.quantity)), updated_at: nowIso() }));
    });
    return { status: "undone" };
  }

  private async receivePurchase(args: Row) {
    const storeId = asString(args.p_store_id);
    const purchaseRef = doc(collection(this.db, "purchases"));
    const purchaseNo = `PO-${String(Date.now()).slice(-6)}`;
    const items = Array.isArray(args.p_items) ? args.p_items : [];
    let subtotal = 0, tax = 0;
    await runTransaction(this.db, async (tx) => {
      for (const item of items) {
        const qty = safeNumber(item.quantity) + safeNumber(item.free_quantity);
        const cost = safeNumber(item.unit_cost);
        const line = qty * cost;
        subtotal += line;
        tax += (line * safeNumber(item.gst_rate)) / 100;
        tx.update(doc(this.db, "products", asString(item.product_id)), { current_stock: increment(qty), purchase_price: cost, updated_at: nowIso() });
        const itemRef = doc(collection(this.db, "purchase_items"));
        tx.set(itemRef, { id: itemRef.id, store_id: storeId, purchase_id: purchaseRef.id, product_id: item.product_id, quantity: qty, unit_cost: cost, gst_rate: safeNumber(item.gst_rate), line_total: line, created_at: nowIso() });
      }
      const paid = safeNumber(args.p_payment_amount);
      const total = subtotal + tax;
      tx.set(purchaseRef, { id: purchaseRef.id, store_id: storeId, purchase_no: purchaseNo, supplier_id: args.p_supplier_id || null, supplier_invoice_no: args.p_supplier_invoice_no || null, invoice_date: nowIso().slice(0, 10), subtotal, tax_total: tax, grand_total: total, paid_total: paid, balance_due: Math.max(0, total - paid), status: "received", created_at: nowIso() });
    });
    return { purchase_id: purchaseRef.id, purchase_no: purchaseNo };
  }

  private async processSaleReturn(args: Row) { const ref = await addDoc(collection(this.db, "sale_returns"), { store_id: args.p_store_id, sale_id: args.p_sale_id, return_no: `SR-${Date.now()}`, total_amount: 0, reason: args.p_reason || null, created_at: nowIso() }); return { return_id: ref.id, return_no: `SR-${Date.now()}` }; }
  private async cancelSale(args: Row) { await updateDoc(doc(this.db, "sales", asString(args.p_sale_id)), { status: "cancelled", cancel_reason: args.p_reason || null, updated_at: nowIso() }); return { status: "cancelled" }; }
  private async processPurchaseReturn(args: Row) { const ref = await addDoc(collection(this.db, "purchase_returns"), { store_id: args.p_store_id, purchase_id: args.p_purchase_id, return_no: `PR-${Date.now()}`, total_amount: 0, reason: args.p_reason || null, created_at: nowIso() }); return { return_id: ref.id }; }
  private async cancelPurchase(args: Row) { await updateDoc(doc(this.db, "purchases", asString(args.p_purchase_id)), { status: "cancelled", cancel_reason: args.p_reason || null, updated_at: nowIso() }); return { status: "cancelled" }; }
  private async postAccountEntry(args: Row) { const ref = await addDoc(collection(this.db, "account_entries"), { store_id: args.p_store_id, account_no: `AC-${Date.now()}`, entry_date: args.p_entry_date || nowIso().slice(0, 10), entry_type: args.p_entry_type, party_type: args.p_party_type, customer_id: args.p_customer_id || null, supplier_id: args.p_supplier_id || null, amount: safeNumber(args.p_amount), payment_method: args.p_payment_method || "cash", reference_no: args.p_reference_no || null, description: args.p_description || null, status: "posted", created_at: nowIso() }); return { entry_id: ref.id }; }
  private async cancelAccountEntry(args: Row) { await updateDoc(doc(this.db, "account_entries", asString(args.p_entry_id)), { status: "cancelled", reason: args.p_reason || null, updated_at: nowIso() }); return { status: "cancelled" }; }
  private async adjustStock(args: Row) { const q = safeNumber(args.p_quantity); const operation = asString(args.p_operation); const delta = operation.includes("decrease") || operation.includes("loss") ? -q : q; await updateDoc(doc(this.db, "products", asString(args.p_product_id)), { current_stock: increment(delta), updated_at: nowIso() }); return { status: "adjusted", delta }; }
  private async repackStock(args: Row) { await this.adjustStock({ p_product_id: args.p_source_product_id, p_quantity: args.p_source_quantity, p_operation: "decrease" }); await this.adjustStock({ p_product_id: args.p_target_product_id, p_quantity: args.p_target_quantity, p_operation: "increase" }); return { status: "repacked" }; }
  private async mergeProducts(args: Row) { const source = await getDoc(doc(this.db, "products", asString(args.p_source_product_id))); if (source.exists()) await updateDoc(doc(this.db, "products", asString(args.p_target_product_id)), { current_stock: increment(safeNumber(source.data().current_stock)), updated_at: nowIso() }); await updateDoc(doc(this.db, "products", asString(args.p_source_product_id)), { active: false, merged_into: args.p_target_product_id, updated_at: nowIso() }); return { status: "merged" }; }
  private async closeBusinessDay(args: Row) { const ref = await addDoc(collection(this.db, "business_documents"), { store_id: args.p_store_id, document_no: `DAY-${Date.now()}`, document_type: "day_end", document_date: args.p_business_date || nowIso().slice(0, 10), status: "closed", amount: safeNumber(args.p_counted_cash), payload: args, created_at: nowIso() }); return { document_id: ref.id }; }
  private async saveBusinessDocument(args: Row) { const ref = await addDoc(collection(this.db, "business_documents"), { store_id: args.p_store_id, document_no: `DOC-${Date.now()}`, document_type: args.p_document_type, document_date: args.p_document_date || nowIso().slice(0, 10), source_id: args.p_source_id || null, source_type: args.p_document_type || null, status: "saved", amount: safeNumber(args.p_amount), payload: args.p_payload || {}, created_at: nowIso() }); return { document_id: ref.id, document_no: `DOC-${Date.now()}` }; }

  private async inviteStaff(body: Row) {
    const storeId = asString(body.store_id);
    if (!storeId || !body.email) throw new Error("Staff email is required");
    const ref = doc(collection(this.db, "store_members"));
    await setDoc(ref, { id: ref.id, store_id: storeId, user_id: body.email, email: body.email, display_name: body.display_name || body.email, role: body.role || "cashier", active: true, created_at: nowIso() });
    return { message: "Staff added. They can sign up with the same email." };
  }
}

export function getFirebaseBrowserClient(): FirebaseCompatClient | null {
  if (typeof window === "undefined") return null;
  if (!cachedClient) cachedClient = new FirebaseCompatClient();
  return cachedClient;
}

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}
