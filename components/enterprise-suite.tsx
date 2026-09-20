"use client";

import {
  Archive, BadgeIndianRupee, Barcode, BookOpenCheck, Boxes, CalendarCheck,
  ChartNoAxesCombined, Check, ClipboardCheck, ClipboardList, Copy, Database,
  Download, FileCheck2, FileClock, FilePenLine, FileSpreadsheet, HandCoins,
  History, IndianRupee, Landmark, ListChecks, LoaderCircle, LockKeyhole,
  Merge, PackageCheck, PackageMinus, PackageOpen, PackagePlus,
  Printer, ReceiptIndianRupee, RefreshCcw, RotateCcw, SearchCheck, Settings,
  ShieldCheck, ShoppingBasket, Store, TableProperties, Truck, Undo2,
  UserRoundCheck, Users, WalletCards, X, type LucideIcon,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export type EnterpriseModule = "sales" | "purchase" | "accounts" | "inventory" | "reports" | "maintenance" | "orders";
type Language = "en" | "ta";
type Product = { id: string; name: string; tamil: string; category: string; unit: string; price: number; mrp: number; stock: number; gst: number; barcode: string };
type Sale = { id: string; invoice_no: string; grand_total: number; tax_total: number; discount_total: number; paid_total: number; balance_due: number; item_count: number; status: string; created_at: string };
type Purchase = { id: string; purchase_no: string; supplier_invoice_no: string | null; invoice_date: string; subtotal?: number; tax_total?: number; grand_total: number; paid_total: number; balance_due: number; status: string; suppliers: { name?: string } | Array<{ name?: string }> | null };
type Customer = { id: string; name: string; phone: string | null; email: string | null; loyalty_points: number; lifetime_value: number; outstanding_balance: number; visit_count: number };
type Supplier = { id: string; name: string; phone: string | null; email: string | null; opening_balance: number; credit_days: number; active: boolean };
type Staff = { user_id: string; display_name: string | null; role: string; active: boolean; created_at: string };
type AccountEntry = { id: string; account_no: string; entry_date: string; entry_type: string; party_type: string; amount: number; payment_method: string; reference_no: string | null; description: string | null; status: string; customers?: { name?: string } | Array<{ name?: string }> | null; suppliers?: { name?: string } | Array<{ name?: string }> | null };
type ReturnRecord = { id: string; document_no: string; source_no: string; total_amount: number; reason: string | null; created_at: string; kind: "sale" | "purchase" };
type BusinessDocument = { id: string; document_no: string; document_type: string; document_date: string; source_type: string | null; source_id: string | null; status: string; amount: number; payload: Record<string, unknown>; created_at: string };
type LineItem = { id: string; product_id: string | null; product_name: string; quantity: number; amount: number };
type ProfitSummary = { sales: number; cost: number; gross_profit: number; margin_percent: number };

type Props = {
  module: EnterpriseModule;
  language: Language;
  live: boolean;
  storeId: string | null;
  products: Product[];
  sales: Sale[];
  purchases: Purchase[];
  customers: Customer[];
  suppliers: Supplier[];
  staff: Staff[];
  profitSummary: ProfitSummary;
  onNotify: (message: string) => void;
  onRefresh: () => Promise<void>;
  onNavigate: (section: string) => void;
  onOpenPurchase: () => void;
  onRequireSignIn: () => void;
  onSignOut: () => Promise<void>;
};

type Feature = { title: string; ta: string; description: string; taDescription: string; icon: LucideIcon; action: string; badge?: string };

const moduleCopy: Record<EnterpriseModule, { eyebrow: string; title: string; ta: string; description: string }> = {
  sales: { eyebrow: "SALES CONTROL", title: "Sales operations", ta: "விற்பனை செயல்பாடுகள்", description: "Returns, audited corrections, cancellations, bill copies and verification" },
  purchase: { eyebrow: "PURCHASE CONTROL", title: "Purchase operations", ta: "கொள்முதல் செயல்பாடுகள்", description: "Purchase entry, vendor returns, corrections, copies and registers" },
  accounts: { eyebrow: "ACCOUNTS", title: "Receipts & payments", ta: "வரவு & செலவு கணக்குகள்", description: "Receipts, payments, credit/debit notes, refunds and account reports" },
  inventory: { eyebrow: "INVENTORY CONTROL", title: "Advanced stock control", ta: "மேம்பட்ட ஸ்டாக் கட்டுப்பாடு", description: "Adjustments, physical stock, correction, repack, merge and transfers" },
  reports: { eyebrow: "BUSINESS INTELLIGENCE", title: "Complete report centre", ta: "முழுமையான அறிக்கை மையம்", description: "GST, profit, stock, user, hourly, tracking and return reports" },
  maintenance: { eyebrow: "SYSTEM CONTROL", title: "Maintenance & day end", ta: "பராமரிப்பு & நாள் முடிவு", description: "Day end, verification, users, backup, operating date and barcode tools" },
  orders: { eyebrow: "ORDER MANAGEMENT", title: "Quotation & home delivery", ta: "கொட்டேஷன் & வீட்டு டெலிவரி", description: "Quotations, delivery scheduling, order status and customer fulfilment" },
};

const featureMap: Record<EnterpriseModule, Feature[]> = {
  sales: [
    { title: "Sales return", ta: "விற்பனை திரும்பப்பெறல்", description: "Partial/full return with refund and restock", taDescription: "பணம் மற்றும் ஸ்டாக் உடன் முழு/பகுதி ரிட்டர்ன்", icon: Undo2, action: "sale_return", badge: "Live" },
    { title: "Sales cancellation", ta: "பில் ரத்து", description: "Void a completed bill and reverse stock", taDescription: "பில்லை ரத்து செய்து ஸ்டாக் திருப்புக", icon: RotateCcw, action: "sale_cancel", badge: "Admin" },
    { title: "Sales modification", ta: "விற்பனை திருத்தம்", description: "Audited note correction without hiding history", taDescription: "பழைய பதிவை மறைக்காமல் காரணத்துடன் திருத்தம்", icon: FilePenLine, action: "sale_modify", badge: "Audit" },
    { title: "Bill copies", ta: "பில் நகல்கள்", description: "Open and print any previous bill", taDescription: "பழைய பில்லை பார்த்து மீண்டும் பிரிண்ட் செய்யவும்", icon: Copy, action: "bill_copy" },
    { title: "Sales report", ta: "விற்பனை அறிக்கை", description: "Datewise sales register and export", taDescription: "தேதிவாரி விற்பனை மற்றும் எக்ஸ்போர்ட்", icon: ChartNoAxesCombined, action: "report_sales" },
    { title: "Quotation", ta: "கொட்டேஷன்", description: "Create a non-stock quotation", taDescription: "ஸ்டாக் மாறாமல் கொட்டேஷன் உருவாக்கவும்", icon: ClipboardList, action: "quotation" },
    { title: "Retail bill", ta: "ரீடெயில் பில்", description: "Open the fast billing counter", taDescription: "வேகமான பில்லிங் கவுன்டரை திறக்கவும்", icon: ReceiptIndianRupee, action: "navigate_billing" },
    { title: "Bill view & verify", ta: "பில் பார்வை & சரிபார்ப்பு", description: "Review and mark documents verified", taDescription: "பில்லை சரிபார்த்து பதிவு செய்யவும்", icon: FileCheck2, action: "bill_verify" },
    { title: "Home delivery", ta: "வீட்டு டெலிவரி", description: "Schedule delivery for a completed sale", taDescription: "முடிந்த பில்லுக்கு டெலிவரி அமைக்கவும்", icon: Truck, action: "delivery" },
  ],
  purchase: [
    { title: "Purchase entry", ta: "கொள்முதல் பதிவு", description: "Receive supplier stock atomically", taDescription: "சப்ளையர் ஸ்டாக்கை பாதுகாப்பாக பெறவும்", icon: PackagePlus, action: "navigate_purchase_entry", badge: "Live" },
    { title: "Purchase returns", ta: "கொள்முதல் ரிட்டர்ன்", description: "Return stock and create a debit note", taDescription: "ஸ்டாக்கை திருப்பி டெபிட் நோட் உருவாக்கவும்", icon: PackageMinus, action: "purchase_return", badge: "Live" },
    { title: "Cancellations", ta: "கொள்முதல் ரத்து", description: "Reverse a purchase with stock checks", taDescription: "ஸ்டாக் சரிபார்ப்புடன் கொள்முதல் ரத்து", icon: RotateCcw, action: "purchase_cancel", badge: "Admin" },
    { title: "Modifications", ta: "கொள்முதல் திருத்தம்", description: "Correct reference and notes with audit", taDescription: "ரெஃபரன்ஸ் மற்றும் குறிப்பை காரணத்துடன் திருத்தவும்", icon: FilePenLine, action: "purchase_modify" },
    { title: "Purchase copies", ta: "கொள்முதல் நகல்கள்", description: "Print a supplier purchase document", taDescription: "சப்ளையர் கொள்முதல் நகலை பிரிண்ட் செய்யவும்", icon: Copy, action: "purchase_copy" },
    { title: "Purchase report", ta: "கொள்முதல் அறிக்கை", description: "Datewise purchase register and export", taDescription: "தேதிவாரி கொள்முதல் ரெஜிஸ்டர்", icon: FileSpreadsheet, action: "report_purchase" },
    { title: "Purchase view", ta: "கொள்முதல் பார்வை", description: "Review supplier bill, status and balance", taDescription: "சப்ளையர் பில் மற்றும் நிலுவை பார்வை", icon: SearchCheck, action: "purchase_view" },
  ],
  accounts: [
    { title: "Receipts", ta: "வரவு ரசீது", description: "Customer or other cash/bank receipt", taDescription: "வாடிக்கையாளர் அல்லது பிற வரவு பதிவு", icon: HandCoins, action: "account_receipt", badge: "Live" },
    { title: "Payments", ta: "செலுத்தல்கள்", description: "Supplier or operating payment entry", taDescription: "சப்ளையர் அல்லது செலவு பதிவு", icon: WalletCards, action: "account_payment", badge: "Live" },
    { title: "Credit note", ta: "கிரெடிட் நோட்", description: "Post an audited credit note", taDescription: "ஆடிட் செய்யப்பட்ட கிரெடிட் நோட்", icon: BadgeIndianRupee, action: "account_credit" },
    { title: "Debit note", ta: "டெபிட் நோட்", description: "Post an audited debit note", taDescription: "ஆடிட் செய்யப்பட்ட டெபிட் நோட்", icon: FilePenLine, action: "account_debit" },
    { title: "Account copies", ta: "கணக்கு நகல்கள்", description: "Print posted account entries", taDescription: "கணக்கு பதிவுகளை பிரிண்ட் செய்யவும்", icon: Copy, action: "account_copy" },
    { title: "Account cancellation", ta: "கணக்கு ரத்து", description: "Cancel an entry with reversal trail", taDescription: "திருப்புப் பதிவுடன் கணக்கை ரத்து செய்யவும்", icon: RotateCcw, action: "account_cancel", badge: "Secure" },
    { title: "Account reports", ta: "கணக்கு அறிக்கைகள்", description: "Receipts, payments and notes register", taDescription: "வரவு, செலவு மற்றும் நோட் ரெஜிஸ்டர்", icon: TableProperties, action: "report_accounts" },
    { title: "Refund register", ta: "ரீபண்ட் ரெஜிஸ்டர்", description: "Review sales and account refunds", taDescription: "விற்பனை மற்றும் கணக்கு ரீபண்ட் பார்வை", icon: RefreshCcw, action: "report_refunds" },
  ],
  inventory: [
    { title: "Stock adjustment", ta: "ஸ்டாக் அட்ஜஸ்ட்மென்ட்", description: "Add, remove, damage or expiry stock", taDescription: "ஸ்டாக் சேர், குறை, சேதம் அல்லது காலாவதி", icon: Boxes, action: "stock_adjust", badge: "Live" },
    { title: "Inventory report", ta: "ஸ்டாக் அறிக்கை", description: "Current stock, value and reorder levels", taDescription: "தற்போதைய ஸ்டாக் மற்றும் மதிப்பு", icon: FileSpreadsheet, action: "report_inventory" },
    { title: "Merge product", ta: "பொருள் இணைப்பு", description: "Merge a duplicate product into another", taDescription: "டூப்ளிகேட் பொருளை மற்றொன்றுடன் இணைக்கவும்", icon: Merge, action: "merge_product", badge: "Admin" },
    { title: "Temp stock adjustment", ta: "தற்காலிக ஸ்டாக் திருத்தம்", description: "Record a temporary signed correction", taDescription: "தற்காலிக அளவு திருத்தம் பதிவு", icon: FileClock, action: "temp_adjust" },
    { title: "Stock correction", ta: "ஸ்டாக் சரிசெய்தல்", description: "Set the exact corrected stock", taDescription: "சரியான ஸ்டாக் எண்ணிக்கையை அமைக்கவும்", icon: ClipboardCheck, action: "stock_correction" },
    { title: "Physical inventory", ta: "நேரடி ஸ்டாக் கணக்கெடுப்பு", description: "Enter the physically counted quantity", taDescription: "நேரில் எண்ணிய அளவை உள்ளிடவும்", icon: ListChecks, action: "physical_inventory", badge: "Count" },
    { title: "Repack", ta: "ரீபேக்", description: "Convert bulk stock into retail packs", taDescription: "மொத்த ஸ்டாக்கை சிறிய பேக்குகளாக மாற்றவும்", icon: PackageOpen, action: "repack", badge: "Live" },
    { title: "Stock advice", ta: "ஸ்டாக் ஆலோசனை", description: "Save reorder and correction advice", taDescription: "ரீஆர்டர் மற்றும் திருத்த ஆலோசனை", icon: BookOpenCheck, action: "stock_advice" },
    { title: "Internal transfer", ta: "உள்புற மாற்றம்", description: "Move stock between backroom and floor", taDescription: "கிடங்கு மற்றும் ஷெல்ஃப் இடையே மாற்றம்", icon: Archive, action: "internal_transfer" },
  ],
  reports: [
    { title: "Price list", ta: "விலைப்பட்டியல்", description: "MRP, selling price and GST", taDescription: "MRP, விற்பனை விலை மற்றும் GST", icon: IndianRupee, action: "report_price_list" },
    { title: "Earning statement", ta: "வருமான அறிக்கை", description: "Sales, purchases and margin", taDescription: "விற்பனை, கொள்முதல் மற்றும் லாபம்", icon: Landmark, action: "report_earning" },
    { title: "GST reports", ta: "GST அறிக்கைகள்", description: "Output/input GST summary", taDescription: "விற்பனை/கொள்முதல் GST சுருக்கம்", icon: ReceiptIndianRupee, action: "report_gst" },
    { title: "Product-customer", ta: "பொருள்-வாடிக்கையாளர்", description: "Customer and product activity", taDescription: "வாடிக்கையாளர் மற்றும் பொருள் செயல்பாடு", icon: Users, action: "report_customer" },
    { title: "Product brief", ta: "பொருள் சுருக்கம்", description: "Complete product master brief", taDescription: "முழு பொருள் மாஸ்டர் சுருக்கம்", icon: PackageCheck, action: "report_product" },
    { title: "Control report", ta: "கண்ட்ரோல் அறிக்கை", description: "Voids, corrections and verification", taDescription: "ரத்து, திருத்தம் மற்றும் சரிபார்ப்பு", icon: ShieldCheck, action: "report_control" },
    { title: "GP report", ta: "மொத்த லாப அறிக்கை", description: "Live gross profit from sale cost", taDescription: "விற்பனை செலவை அடிப்படையாக கொண்ட மொத்த லாபம்", icon: ChartNoAxesCombined, action: "report_gp" },
    { title: "Top report", ta: "டாப் அறிக்கை", description: "Top bills and stock value", taDescription: "அதிக பில்கள் மற்றும் ஸ்டாக் மதிப்பு", icon: BadgeIndianRupee, action: "report_top" },
    { title: "Event log", ta: "நிகழ்வு பதிவு", description: "Operational audit documents", taDescription: "செயல்பாட்டு ஆடிட் பதிவுகள்", icon: History, action: "report_events" },
    { title: "Hourly sales/purchase", ta: "மணிநேர விற்பனை/கொள்முதல்", description: "Hourly business movement", taDescription: "மணிநேர வணிக இயக்கம்", icon: FileClock, action: "report_hourly" },
    { title: "User brief", ta: "பயனர் சுருக்கம்", description: "Staff role and access status", taDescription: "ஊழியர் ரோல் மற்றும் அணுகல் நிலை", icon: UserRoundCheck, action: "report_users" },
    { title: "Daily tracking", ta: "தினசரி ட்ராக்கிங்", description: "Daily sales and document activity", taDescription: "தினசரி விற்பனை மற்றும் ஆவணங்கள்", icon: CalendarCheck, action: "report_daily" },
    { title: "Returns report", ta: "ரிட்டர்ன் அறிக்கை", description: "Sales and purchase returns", taDescription: "விற்பனை மற்றும் கொள்முதல் ரிட்டர்ன்", icon: Undo2, action: "report_returns" },
    { title: "Pivot export", ta: "பிவட் எக்ஸ்போர்ட்", description: "CSV-ready business data", taDescription: "CSV-க்கு தயாரான வணிக தரவு", icon: TableProperties, action: "report_pivot" },
  ],
  maintenance: [
    { title: "Day end", ta: "நாள் முடிவு", description: "Close cash with expected/actual variance", taDescription: "எதிர்பார்ப்பு/உண்மை பணத்துடன் நாள் முடிக்கவும்", icon: CalendarCheck, action: "day_end", badge: "Live" },
    { title: "Settings", ta: "அமைப்புகள்", description: "Store, tax, invoice and language", taDescription: "கடை, வரி, இன்வாய்ஸ் மற்றும் மொழி", icon: Settings, action: "navigate_settings" },
    { title: "Database info", ta: "டேட்டாபேஸ் தகவல்", description: "Cloud security and sync status", taDescription: "கிளவுட் பாதுகாப்பு மற்றும் சிங்க் நிலை", icon: Database, action: "database_info" },
    { title: "Active users", ta: "செயலில் உள்ள பயனர்கள்", description: "Review enabled staff accounts", taDescription: "செயலில் உள்ள ஊழியர் கணக்குகள்", icon: Users, action: "active_users" },
    { title: "Data backup", ta: "டேட்டா பேக்கப்", description: "Download a structured JSON backup", taDescription: "JSON பேக்கப் டவுன்லோட் செய்யவும்", icon: Download, action: "backup" },
    { title: "Bill verification", ta: "பில் சரிபார்ப்பு", description: "Verify a sale with audit history", taDescription: "ஆடிட் பதிவுடன் பில் சரிபார்ப்பு", icon: FileCheck2, action: "bill_verify" },
    { title: "Change password", ta: "கடவுச்சொல் மாற்றம்", description: "Update your Supabase login password", taDescription: "உங்கள் லாகின் கடவுச்சொல்லை மாற்றவும்", icon: LockKeyhole, action: "change_password" },
    { title: "Operating date", ta: "செயல்பாட்டு தேதி", description: "Set the working business date", taDescription: "பணிபுரியும் வணிக தேதியை அமைக்கவும்", icon: FileClock, action: "operating_date" },
    { title: "Bar codes", ta: "பார்கோடுகள்", description: "Print EAN-13 product labels", taDescription: "EAN-13 பொருள் லேபிள்களை பிரிண்ட் செய்யவும்", icon: Barcode, action: "barcode_batch" },
    { title: "Log off", ta: "வெளியேறு", description: "Securely sign out this device", taDescription: "இந்த சாதனத்திலிருந்து பாதுகாப்பாக வெளியேறவும்", icon: LockKeyhole, action: "logoff" },
  ],
  orders: [
    { title: "Quotation", ta: "கொட்டேஷன்", description: "Save product quotation without stock movement", taDescription: "ஸ்டாக் மாறாமல் கொட்டேஷன் சேமிக்கவும்", icon: ClipboardList, action: "quotation", badge: "Live" },
    { title: "Home delivery", ta: "வீட்டு டெலிவரி", description: "Schedule an invoice for delivery", taDescription: "இன்வாய்ஸுக்கு டெலிவரி அமைக்கவும்", icon: Truck, action: "delivery", badge: "Live" },
    { title: "Order status", ta: "ஆர்டர் நிலை", description: "Track scheduled and completed documents", taDescription: "திட்டமிட்ட மற்றும் முடிந்த ஆர்டர்கள்", icon: ListChecks, action: "report_orders" },
    { title: "Customer orders", ta: "வாடிக்கையாளர் ஆர்டர்கள்", description: "Review quotation and delivery history", taDescription: "கொட்டேஷன் மற்றும் டெலிவரி வரலாறு", icon: ShoppingBasket, action: "report_orders" },
    { title: "Delivery report", ta: "டெலிவரி அறிக்கை", description: "Datewise home delivery export", taDescription: "தேதிவாரி டெலிவரி எக்ஸ்போர்ட்", icon: FileSpreadsheet, action: "report_delivery" },
    { title: "Retail billing", ta: "ரீடெயில் பில்லிங்", description: "Create the customer bill first", taDescription: "முதலில் வாடிக்கையாளர் பில் உருவாக்கவும்", icon: Store, action: "navigate_billing" },
  ],
};

const currency = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value || 0);
const getRelationName = (value: { name?: string } | Array<{ name?: string }> | null | undefined) => Array.isArray(value) ? value[0]?.name : value?.name;
const formatDate = (value: string) => new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const safeNumber = (value: unknown) => Number(value || 0);

export function EnterpriseSuite(props: Props) {
  const { module, language, live, storeId, products, sales, purchases, customers, suppliers, staff, profitSummary, onNotify, onRefresh, onNavigate, onOpenPurchase, onRequireSignIn, onSignOut } = props;
  const [accounts, setAccounts] = useState<AccountEntry[]>([]);
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [documents, setDocuments] = useState<BusinessDocument[]>([]);
  const [action, setAction] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [lineBusy, setLineBusy] = useState(false);
  const [selectedReport, setSelectedReport] = useState("sales");
  const [reportProfit, setReportProfit] = useState<ProfitSummary>(profitSummary);
  const [fromDate, setFromDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const title = moduleCopy[module];

  useEffect(() => { setReportProfit(profitSummary); }, [profitSummary]);
  useEffect(() => {
    if (!storeId || !live) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    void supabase.rpc("profit_summary", {
      p_store_id: storeId,
      p_from: `${fromDate}T00:00:00+05:30`,
      p_to: `${toDate}T23:59:59+05:30`,
    }).then(({ data, error }) => {
      if (error || !data) return;
      const row = data as Record<string, unknown>;
      setReportProfit({
        sales: Number(row.sales || 0),
        cost: Number(row.cost || 0),
        gross_profit: Number(row.gross_profit || 0),
        margin_percent: Number(row.margin_percent || 0),
      });
    });
  }, [storeId, live, fromDate, toDate]);

  const loadExtended = useCallback(async () => {
    if (!storeId || !live) { setAccounts([]); setReturns([]); setDocuments([]); return; }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const [accountResult, saleReturnResult, purchaseReturnResult, documentResult] = await Promise.all([
      supabase.from("account_entries").select("id,account_no,entry_date,entry_type,party_type,amount,payment_method,reference_no,description,status,customers(name),suppliers(name)").eq("store_id", storeId).order("created_at", { ascending: false }).limit(500),
      supabase.from("sale_returns").select("id,return_no,total_amount,reason,created_at,sales(invoice_no)").eq("store_id", storeId).order("created_at", { ascending: false }).limit(300),
      supabase.from("purchase_returns").select("id,return_no,total_amount,reason,created_at,purchases(purchase_no)").eq("store_id", storeId).order("created_at", { ascending: false }).limit(300),
      supabase.from("business_documents").select("id,document_no,document_type,document_date,source_type,source_id,status,amount,payload,created_at").eq("store_id", storeId).order("created_at", { ascending: false }).limit(500),
    ]);
    const firstError = [accountResult.error, saleReturnResult.error, purchaseReturnResult.error, documentResult.error].find(Boolean);
    if (firstError) throw firstError;
    setAccounts(((accountResult.data ?? []) as unknown as AccountEntry[]).map((row) => ({ ...row, amount: safeNumber(row.amount) })));
    const saleRows = (saleReturnResult.data ?? []) as unknown as Array<Record<string, unknown>>;
    const purchaseRows = (purchaseReturnResult.data ?? []) as unknown as Array<Record<string, unknown>>;
    setReturns([
      ...saleRows.map((row) => {
        const source = (Array.isArray(row.sales) ? row.sales[0] : row.sales) as { invoice_no?: string } | null;
        return { id: String(row.id), document_no: String(row.return_no), source_no: String(source?.invoice_no || "Sale"), total_amount: safeNumber(row.total_amount), reason: String(row.reason || "") || null, created_at: String(row.created_at), kind: "sale" as const };
      }),
      ...purchaseRows.map((row) => {
        const source = (Array.isArray(row.purchases) ? row.purchases[0] : row.purchases) as { purchase_no?: string } | null;
        return { id: String(row.id), document_no: String(row.return_no), source_no: String(source?.purchase_no || "Purchase"), total_amount: safeNumber(row.total_amount), reason: String(row.reason || "") || null, created_at: String(row.created_at), kind: "purchase" as const };
      }),
    ].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    setDocuments(((documentResult.data ?? []) as unknown as BusinessDocument[]).map((row) => ({ ...row, amount: safeNumber(row.amount), payload: row.payload || {} })));
  }, [live, storeId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadExtended().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Operational records could not be loaded"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadExtended]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (!sourceId || !storeId || !["sale_return", "purchase_return"].includes(action || "")) { if (active) setLineItems([]); return; }
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      setLineBusy(true); setLineItems([]);
      const query = action === "sale_return"
        ? supabase.from("sale_items").select("id,product_id,product_name,quantity,line_total").eq("store_id", storeId).eq("sale_id", sourceId)
        : supabase.from("purchase_items").select("id,product_id,quantity,line_total,products(name_en)").eq("store_id", storeId).eq("purchase_id", sourceId);
      void (async () => {
        try {
          const { data, error: itemError } = await query;
          if (!active) return;
          if (itemError) { setError(itemError.message); return; }
          const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
          setLineItems(rows.map((row) => ({
            id: String(row.id), product_id: row.product_id ? String(row.product_id) : null,
            product_name: String(row.product_name || (Array.isArray(row.products) ? row.products[0]?.name_en : (row.products as { name_en?: string } | null)?.name_en) || "Product"),
            quantity: safeNumber(row.quantity), amount: safeNumber(row.line_total),
          })));
        } finally { if (active) setLineBusy(false); }
      })();
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [action, sourceId, storeId]);

  const filteredSales = useMemo(() => sales.filter((row) => dateInRange(row.created_at, fromDate, toDate)), [sales, fromDate, toDate]);
  const filteredPurchases = useMemo(() => purchases.filter((row) => (!fromDate || row.invoice_date >= fromDate) && (!toDate || row.invoice_date <= toDate)), [purchases, fromDate, toDate]);
  const filteredAccounts = useMemo(() => accounts.filter((row) => (!fromDate || row.entry_date >= fromDate) && (!toDate || row.entry_date <= toDate)), [accounts, fromDate, toDate]);

  const report = useMemo(() => buildReport(selectedReport, { products, sales: filteredSales, purchases: filteredPurchases, accounts: filteredAccounts, returns, documents, customers, suppliers, staff }, reportProfit), [selectedReport, products, filteredSales, filteredPurchases, filteredAccounts, returns, documents, customers, suppliers, staff, reportProfit]);

  const openAction = (next: string) => {
    if (next === "navigate_purchase_entry") { onOpenPurchase(); return; }
    if (next.startsWith("navigate_")) { onNavigate(next.replace("navigate_", "").replace("purchase_entry", "purchases")); return; }
    if (next === "logoff") { void onSignOut(); return; }
    if (next === "backup") { downloadJson("alsa-store-backup.json", { exported_at: new Date().toISOString(), products, sales, purchases, customers, suppliers, staff, accounts, returns, documents }); onNotify("Secure data backup downloaded"); return; }
    if (next === "database_info" || next === "active_users") { setAction(next); setError(""); return; }
    if (next === "purchase_view") { setSelectedReport("purchase"); onNavigate("reports"); return; }
    if (next.startsWith("report_")) { const key = next.replace("report_", ""); setSelectedReport(key); if (module !== "reports") onNavigate("reports"); return; }
    if (!live || !storeId) { onRequireSignIn(); return; }
    setSourceId(""); setLineItems([]); setError(""); setAction(next);
  };

  const submitAction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!action || !storeId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) || "").trim();
    const number = (name: string) => safeNumber(value(name));
    const rpc = async (name: string, args: Record<string, unknown>) => { const { data, error: rpcError } = await supabase.rpc(name, args); if (rpcError) throw rpcError; return data as Record<string, unknown> | null; };
    setBusy(true); setError("");
    try {
      let result: Record<string, unknown> | null = null;
      if (action === "sale_return") result = await rpc("process_sale_return", { p_store_id: storeId, p_sale_id: value("sale_id"), p_items: [{ sale_item_id: value("line_id"), quantity: number("quantity"), restock: value("restock") !== "no" }], p_refund_method: value("payment_method"), p_reason: value("reason") });
      else if (action === "sale_cancel") result = await rpc("cancel_sale", { p_store_id: storeId, p_sale_id: value("sale_id"), p_reason: value("reason") });
      else if (action === "purchase_return") result = await rpc("process_purchase_return", { p_store_id: storeId, p_purchase_id: value("purchase_id"), p_items: [{ purchase_item_id: value("line_id"), quantity: number("quantity") }], p_reason: value("reason") });
      else if (action === "purchase_cancel") result = await rpc("cancel_purchase", { p_store_id: storeId, p_purchase_id: value("purchase_id"), p_reason: value("reason") });
      else if (["account_receipt", "account_payment", "account_credit", "account_debit"].includes(action)) {
        const type = ({ account_receipt: "receipt", account_payment: "payment", account_credit: "credit_note", account_debit: "debit_note" } as Record<string, string>)[action];
        result = await rpc("post_account_entry", { p_store_id: storeId, p_entry_type: type, p_party_type: value("party_type"), p_customer_id: value("customer_id") || null, p_supplier_id: value("supplier_id") || null, p_amount: number("amount"), p_payment_method: value("payment_method"), p_reference_no: value("reference_no") || null, p_description: value("description") || null, p_entry_date: value("entry_date") || new Date().toISOString().slice(0, 10) });
      } else if (action === "account_cancel") result = await rpc("cancel_account_entry", { p_store_id: storeId, p_entry_id: value("entry_id"), p_reason: value("reason") });
      else if (["stock_adjust", "temp_adjust", "stock_correction", "physical_inventory"].includes(action)) {
        const operation = action === "stock_adjust" ? value("operation") : action === "temp_adjust" ? "temp_adjustment" : action;
        result = await rpc("adjust_stock", { p_store_id: storeId, p_product_id: value("product_id"), p_operation: operation, p_quantity: number("quantity"), p_reason: value("reason") });
      } else if (action === "repack") result = await rpc("repack_stock", { p_store_id: storeId, p_source_product_id: value("source_product_id"), p_target_product_id: value("target_product_id"), p_source_quantity: number("source_quantity"), p_target_quantity: number("target_quantity"), p_reason: value("reason") });
      else if (action === "merge_product") result = await rpc("merge_products", { p_store_id: storeId, p_source_product_id: value("source_product_id"), p_target_product_id: value("target_product_id"), p_reason: value("reason") });
      else if (action === "day_end") result = await rpc("close_business_day", { p_store_id: storeId, p_business_date: value("business_date"), p_opening_cash: number("opening_cash"), p_counted_cash: number("counted_cash"), p_notes: value("notes") || null });
      else if (action === "change_password") { if (value("password") !== value("confirm_password")) throw new Error("Passwords do not match"); const { error: passwordError } = await supabase.auth.updateUser({ password: value("password") }); if (passwordError) throw passwordError; result = { status: "updated" }; }
      else if (action === "operating_date") { const { error: dateError } = await supabase.from("store_settings").update({ operating_date: value("operating_date") }).eq("store_id", storeId); if (dateError) throw dateError; result = { status: "updated" }; }
      else if (action === "bill_copy") { await printSale(supabase, storeId, value("sale_id")); result = { status: "printed" }; }
      else if (action === "purchase_copy") { await printPurchase(supabase, storeId, value("purchase_id")); result = { status: "printed" }; }
      else if (action === "account_copy") { const entry = accounts.find((row) => row.id === value("entry_id")); if (!entry) throw new Error("Account entry not found"); printAccount(entry); result = { status: "printed" }; }
      else if (action === "barcode_batch") { const product = products.find((row) => row.id === value("product_id")); if (!product) throw new Error("Product not found"); printBarcodeLabels(product, Math.min(100, Math.max(1, number("copies")))); result = await rpc("save_business_document", { p_store_id: storeId, p_document_type: "barcode_batch", p_source_id: product.id, p_document_date: new Date().toISOString().slice(0, 10), p_amount: 0, p_payload: { barcode: product.barcode, copies: number("copies") } }); }
      else {
        const type = action === "sale_modify" ? "sales_modification" : action === "purchase_modify" ? "purchase_modification" : action === "bill_verify" ? "bill_verification" : action === "quotation" ? "quotation" : action === "delivery" ? "home_delivery" : action === "internal_transfer" ? "internal_transfer" : action === "stock_advice" ? "stock_advice" : "physical_inventory";
        const source = value("sale_id") || value("purchase_id") || value("product_id") || null;
        const payload = Object.fromEntries(Array.from(form.entries()).map(([key, formValue]) => [key, String(formValue)]));
        if (action === "quotation") { const product = products.find((row) => row.id === value("product_id")); payload.items = JSON.stringify([{ product_id: product?.id, name: product?.name, quantity: number("quantity"), unit_price: product?.price, gst: product?.gst }]); }
        result = await rpc("save_business_document", { p_store_id: storeId, p_document_type: type, p_source_id: source, p_document_date: value("document_date") || value("delivery_date") || new Date().toISOString().slice(0, 10), p_amount: action === "quotation" ? number("quantity") * (products.find((row) => row.id === value("product_id"))?.price || 0) : number("amount"), p_payload: payload });
      }
      await Promise.all([loadExtended(), onRefresh()]);
      setAction(null); onNotify(String(result?.document_no || result?.return_no || result?.account_no || "Operation saved successfully"));
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Operation could not be saved"); }
    finally { setBusy(false); }
  };

  const showReport = module === "reports";
  return <div className="enterprise-suite">
    <header className="enterprise-head"><div><span>{title.eyebrow}</span><h1>{language === "ta" ? title.ta : title.title}</h1><p>{title.description}</p></div><div className={`suite-live-pill ${live ? "is-live" : ""}`}><span />{live ? "Live operations" : "Sign in required"}</div></header>
    <div className="enterprise-command-bar" aria-label="Business modules">{(["sales","purchase","accounts","inventory","reports","maintenance","orders"] as EnterpriseModule[]).map((item) => <button key={item} className={module === item ? "active" : ""} onClick={() => onNavigate(item === "purchase" ? "purchases" : item)}>{moduleCopy[item].title.replace(" operations", "")}</button>)}</div>
    <section className="feature-grid">{featureMap[module].map(({ icon: Icon, ...feature }) => <button key={feature.title} className="enterprise-feature" onClick={() => openAction(feature.action)}><span className="feature-icon"><Icon size={21} /></span><span className="feature-copy"><strong>{language === "ta" ? feature.ta : feature.title}</strong><small>{language === "ta" ? feature.taDescription : feature.description}</small></span>{feature.badge && <em>{feature.badge}</em>}</button>)}</section>
    {showReport ? <ReportPanel report={report} selected={selectedReport} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} onExport={() => { downloadCsv(`alsa-${selectedReport}-${fromDate}-to-${toDate}.csv`, report.columns, report.rows); onNotify(`${report.rows.length} report rows exported`); }} /> : <OperationLedger module={module} sales={sales} purchases={purchases} accounts={accounts} returns={returns} documents={documents} />}
    {action && <ActionModal action={action} busy={busy} error={error} sourceId={sourceId} setSourceId={setSourceId} lineBusy={lineBusy} lineItems={lineItems} products={products} sales={sales} purchases={purchases} customers={customers} suppliers={suppliers} staff={staff} accounts={accounts} live={live} onClose={() => setAction(null)} onSubmit={submitAction} />}
  </div>;
}

function OperationLedger({ module, sales, purchases, accounts, returns, documents }: { module: EnterpriseModule; sales: Sale[]; purchases: Purchase[]; accounts: AccountEntry[]; returns: ReturnRecord[]; documents: BusinessDocument[] }) {
  const rows = module === "sales" ? sales.slice(0, 8).map((row) => [row.invoice_no, formatDate(row.created_at), row.status, currency(row.grand_total)])
    : module === "purchase" ? purchases.slice(0, 8).map((row) => [row.purchase_no, row.invoice_date, row.status, currency(row.grand_total)])
    : module === "accounts" ? accounts.slice(0, 8).map((row) => [row.account_no, row.entry_date, row.entry_type.replaceAll("_", " "), currency(row.amount)])
    : module === "inventory" ? documents.filter((row) => ["internal_transfer","physical_inventory","stock_advice","barcode_batch"].includes(row.document_type)).slice(0, 8).map((row) => [row.document_no, row.document_date, row.document_type.replaceAll("_", " "), row.status])
    : module === "orders" ? documents.filter((row) => ["quotation","home_delivery"].includes(row.document_type)).slice(0, 8).map((row) => [row.document_no, row.document_date, row.document_type.replaceAll("_", " "), row.status])
    : module === "maintenance" ? documents.slice(0, 8).map((row) => [row.document_no, row.document_date, row.document_type.replaceAll("_", " "), row.status])
    : returns.slice(0, 8).map((row) => [row.document_no, formatDate(row.created_at), row.kind, currency(row.total_amount)]);
  return <section className="suite-ledger"><div className="suite-panel-head"><div><h2>Recent operational records</h2><p>Live documents with secured audit history</p></div><span>{rows.length} shown</span></div><div className="suite-table"><div className="suite-table-row suite-table-head"><span>Document</span><span>Date</span><span>Type / status</span><span>Amount / state</span></div>{rows.map((row, index) => <div className="suite-table-row" key={`${row[0]}-${index}`}>{row.map((cell) => <span key={String(cell)}>{cell}</span>)}</div>)}{!rows.length && <div className="suite-empty"><ClipboardList size={26} /><strong>No live records yet</strong><span>Use an operation above to create the first document.</span></div>}</div></section>;
}

function ReportPanel({ report, selected, fromDate, toDate, setFromDate, setToDate, onExport }: { report: { title: string; columns: string[]; rows: Array<Array<string | number>>; summary: Array<{ label: string; value: string }> }; selected: string; fromDate: string; toDate: string; setFromDate: (value: string) => void; setToDate: (value: string) => void; onExport: () => void }) {
  return <section className="suite-ledger report-panel"><div className="suite-panel-head"><div><span className="report-key">{selected.replaceAll("_", " ")}</span><h2>{report.title}</h2><p>Live datewise report · Asia/Kolkata</p></div><div className="report-filter"><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /><span>to</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /><button onClick={onExport}><Download size={16} /> Export CSV</button></div></div><div className="report-summary">{report.summary.map((item) => <article key={item.label}><span>{item.label}</span><strong>{item.value}</strong></article>)}</div><div className="suite-table report-table"><div className="suite-table-row suite-table-head" style={{ gridTemplateColumns: `repeat(${report.columns.length}, minmax(120px, 1fr))` }}>{report.columns.map((column) => <span key={column}>{column}</span>)}</div>{report.rows.slice(0, 100).map((row, index) => <div className="suite-table-row" key={index} style={{ gridTemplateColumns: `repeat(${report.columns.length}, minmax(120px, 1fr))` }}>{row.map((cell, cellIndex) => <span key={`${cellIndex}-${String(cell)}`}>{cell}</span>)}</div>)}{!report.rows.length && <div className="suite-empty"><FileSpreadsheet size={26} /><strong>No records in this date range</strong><span>Change the dates or create live transactions.</span></div>}</div></section>;
}

function ActionModal({ action, busy, error, sourceId, setSourceId, lineBusy, lineItems, products, sales, purchases, customers, suppliers, staff, accounts, live, onClose, onSubmit }: { action: string; busy: boolean; error: string; sourceId: string; setSourceId: (value: string) => void; lineBusy: boolean; lineItems: LineItem[]; products: Product[]; sales: Sale[]; purchases: Purchase[]; customers: Customer[]; suppliers: Supplier[]; staff: Staff[]; accounts: AccountEntry[]; live: boolean; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void> }) {
  const heading = action.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  if (action === "database_info") return <InfoModal title="Database information" icon={Database} onClose={onClose}><div className="suite-info-list"><span><Check size={16} /> Supabase cloud database connected</span><span><ShieldCheck size={16} /> Row Level Security enabled</span><span><Database size={16} /> Atomic sales, purchase and stock operations</span><span><FileCheck2 size={16} /> Audit trail active for protected changes</span></div></InfoModal>;
  if (action === "active_users") return <InfoModal title="Active staff accounts" icon={Users} onClose={onClose}><div className="active-user-list">{staff.map((person) => <div key={person.user_id}><span>{(person.display_name || "Alsa Staff").slice(0, 2).toUpperCase()}</span><div><strong>{person.display_name || "Alsa Staff"}</strong><small>{person.role.replaceAll("_", " ")}</small></div><em>{person.active ? "Active" : "Disabled"}</em></div>)}</div></InfoModal>;
  const today = new Date().toISOString().slice(0, 10);
  const saleSelect = <FieldSelect name="sale_id" label="Sales bill" required value={sourceId} onChange={setSourceId} options={sales.filter((row) => row.status === "completed").map((row) => ({ value: row.id, label: `${row.invoice_no} · ${currency(row.grand_total)}` }))} />;
  const purchaseSelect = <FieldSelect name="purchase_id" label="Purchase document" required value={sourceId} onChange={setSourceId} options={purchases.filter((row) => row.status !== "cancelled").map((row) => ({ value: row.id, label: `${row.purchase_no} · ${currency(row.grand_total)}` }))} />;
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label={heading}><button className="modal-backdrop" onClick={() => !busy && onClose()} /><section className="suite-modal"><header><div><span><ShieldCheck size={13} /> SECURE OPERATION</span><h2>{heading}</h2><p>{live ? "Changes are saved to Supabase with staff identity and audit history." : "Sign in is required for this operation."}</p></div><button type="button" onClick={onClose} disabled={busy}><X size={19} /></button></header><form onSubmit={(event) => void onSubmit(event)}>
    {action === "sale_return" && <>{saleSelect}<FieldSelect name="line_id" label="Return item" required disabled={lineBusy || !lineItems.length} options={lineItems.map((item) => ({ value: item.id, label: `${item.product_name} · Sold ${item.quantity}` }))} /><div className="suite-form-row"><FieldInput name="quantity" label="Return quantity" type="number" min="0.001" step="0.001" required /><FieldSelect name="payment_method" label="Refund method" required defaultValue="cash" options={paymentOptions} /></div><FieldSelect name="restock" label="Return to saleable stock?" required defaultValue="yes" options={[{ value: "yes", label: "Yes — restock" }, { value: "no", label: "No — damaged / unusable" }]} /><FieldInput name="reason" label="Return reason" required placeholder="Customer return / quality issue" /></>}
    {action === "sale_cancel" && <>{saleSelect}<FieldInput name="reason" label="Cancellation reason" required placeholder="Wrong bill / duplicate invoice" /><Warning>Stock and customer balance are reversed. Bills with an existing return cannot be cancelled.</Warning></>}
    {action === "sale_modify" && <>{saleSelect}<FieldInput name="notes" label="Corrected bill note" placeholder="Updated customer reference" /><FieldInput name="reason" label="Modification reason" required /><Warning>Financial line items stay immutable. Use Sales Return + new bill for quantity or price corrections.</Warning></>}
    {action === "bill_copy" && saleSelect}
    {action === "bill_verify" && <>{saleSelect}<FieldInput name="reason" label="Verification note" placeholder="Cash and items cross-checked" /></>}
    {action === "purchase_return" && <>{purchaseSelect}<FieldSelect name="line_id" label="Return item" required disabled={lineBusy || !lineItems.length} options={lineItems.map((item) => ({ value: item.id, label: `${item.product_name} · Received ${item.quantity}` }))} /><FieldInput name="quantity" label="Return quantity" type="number" min="0.001" step="0.001" required /><FieldInput name="reason" label="Return reason" required /></>}
    {action === "purchase_cancel" && <>{purchaseSelect}<FieldInput name="reason" label="Cancellation reason" required /><Warning>Received stock is removed only when enough stock is still available.</Warning></>}
    {action === "purchase_modify" && <>{purchaseSelect}<FieldInput name="supplier_invoice_no" label="Correct supplier invoice" /><FieldInput name="notes" label="Corrected notes" /><FieldInput name="reason" label="Modification reason" required /></>}
    {action === "purchase_copy" && purchaseSelect}
    {["account_receipt","account_payment","account_credit","account_debit"].includes(action) && <><div className="suite-form-row"><FieldSelect name="party_type" label="Party type" required defaultValue={action === "account_payment" ? "supplier" : "customer"} options={[{ value: "customer", label: "Customer" }, { value: "supplier", label: "Supplier" }, { value: "other", label: "Other / General" }]} /><FieldInput name="entry_date" label="Entry date" type="date" defaultValue={today} required /></div><FieldSelect name="customer_id" label="Customer (when selected)" options={customers.map((row) => ({ value: row.id, label: row.name }))} /><FieldSelect name="supplier_id" label="Supplier (when selected)" options={suppliers.map((row) => ({ value: row.id, label: row.name }))} /><div className="suite-form-row"><FieldInput name="amount" label="Amount" type="number" min="0.01" step="0.01" required /><FieldSelect name="payment_method" label="Payment method" required defaultValue="cash" options={paymentOptions} /></div><FieldInput name="reference_no" label="Reference number" /><FieldInput name="description" label="Description" /></>}
    {action === "account_cancel" && <><FieldSelect name="entry_id" label="Account entry" required options={accounts.filter((row) => row.status === "posted").map((row) => ({ value: row.id, label: `${row.account_no} · ${row.entry_type.replaceAll("_", " ")} · ${currency(row.amount)}` }))} /><FieldInput name="reason" label="Cancellation reason" required /></>}
    {action === "account_copy" && <FieldSelect name="entry_id" label="Account entry" required options={accounts.map((row) => ({ value: row.id, label: `${row.account_no} · ${currency(row.amount)}` }))} />}
    {["stock_adjust","temp_adjust","stock_correction","physical_inventory"].includes(action) && <><FieldSelect name="product_id" label="Product" required options={products.map((row) => ({ value: row.id, label: `${row.name} · Current ${row.stock}` }))} />{action === "stock_adjust" && <FieldSelect name="operation" label="Operation" required defaultValue="adjustment_in" options={[{ value: "adjustment_in", label: "Add stock" }, { value: "adjustment_out", label: "Remove stock" }, { value: "damage", label: "Damage" }, { value: "expiry", label: "Expiry" }]} />}<FieldInput name="quantity" label={action === "stock_correction" || action === "physical_inventory" ? "Exact counted stock" : "Quantity / signed change"} type="number" step="0.001" required /><FieldInput name="reason" label="Reason" required /></>}
    {(action === "repack" || action === "merge_product") && <><FieldSelect name="source_product_id" label="Source product" required options={products.map((row) => ({ value: row.id, label: `${row.name} · ${row.stock}` }))} /><FieldSelect name="target_product_id" label="Target product" required options={products.map((row) => ({ value: row.id, label: `${row.name} · ${row.stock}` }))} />{action === "repack" && <div className="suite-form-row"><FieldInput name="source_quantity" label="Bulk quantity used" type="number" min="0.001" step="0.001" required /><FieldInput name="target_quantity" label="Retail packs created" type="number" min="0.001" step="0.001" required /></div>}<FieldInput name="reason" label={action === "merge_product" ? "Merge confirmation reason" : "Repack reason"} required /><Warning>{action === "merge_product" ? "The source product becomes inactive and its stock/barcodes move to the target." : "Source stock decreases and target stock increases atomically."}</Warning></>}
    {action === "internal_transfer" && <><FieldSelect name="product_id" label="Product" required options={products.map((row) => ({ value: row.id, label: row.name }))} /><FieldInput name="amount" label="Quantity" type="number" min="0.001" step="0.001" required /><div className="suite-form-row"><FieldInput name="from_location" label="From location" defaultValue="Backroom" required /><FieldInput name="to_location" label="To location" defaultValue="Shop floor" required /></div><FieldInput name="notes" label="Transfer note" /></>}
    {action === "stock_advice" && <><FieldSelect name="product_id" label="Product" required options={products.map((row) => ({ value: row.id, label: `${row.name} · Stock ${row.stock}` }))} /><FieldInput name="amount" label="Suggested quantity" type="number" min="0" step="0.001" required /><FieldInput name="notes" label="Advice / reason" required /></>}
    {action === "quotation" && <><FieldSelect name="customer_id" label="Customer (optional)" options={customers.map((row) => ({ value: row.id, label: row.name }))} /><FieldSelect name="product_id" label="Product" required options={products.map((row) => ({ value: row.id, label: `${row.name} · ${currency(row.price)}` }))} /><div className="suite-form-row"><FieldInput name="quantity" label="Quantity" type="number" min="0.001" step="0.001" required /><FieldInput name="document_date" label="Quotation date" type="date" defaultValue={today} required /></div><FieldInput name="valid_until" label="Valid until" type="date" /><FieldInput name="notes" label="Quotation note" /></>}
    {action === "delivery" && <>{saleSelect}<FieldInput name="address" label="Delivery address" required /><div className="suite-form-row"><FieldInput name="phone" label="Customer phone" /><FieldInput name="delivery_date" label="Delivery date" type="date" defaultValue={today} required /></div><div className="suite-form-row"><FieldInput name="delivery_slot" label="Delivery slot" placeholder="5:00 PM – 7:00 PM" /><FieldInput name="amount" label="Delivery fee" type="number" min="0" step="0.01" defaultValue="0" /></div><FieldInput name="notes" label="Delivery instructions" /></>}
    {action === "day_end" && <><FieldInput name="business_date" label="Business date" type="date" defaultValue={today} required /><div className="suite-form-row"><FieldInput name="opening_cash" label="Opening cash" type="number" min="0" step="0.01" defaultValue="0" required /><FieldInput name="counted_cash" label="Actual counted cash" type="number" min="0" step="0.01" required /></div><FieldInput name="notes" label="Day-end note" /><Warning>Sales, returns and cash account entries are calculated directly from live records.</Warning></>}
    {action === "change_password" && <><FieldInput name="password" label="New password" type="password" minLength={8} required /><FieldInput name="confirm_password" label="Confirm password" type="password" minLength={8} required /></>}
    {action === "operating_date" && <FieldInput name="operating_date" label="Operating date" type="date" defaultValue={today} required />}
    {action === "barcode_batch" && <><FieldSelect name="product_id" label="Product" required options={products.map((row) => ({ value: row.id, label: `${row.name} · ${row.barcode}` }))} /><FieldInput name="copies" label="Label copies" type="number" min="1" max="100" step="1" defaultValue="24" required /></>}
    {error && <p className="suite-error">{error}</p>}<button className="suite-submit" disabled={busy}>{busy ? <LoaderCircle size={18} className="spin" /> : action.includes("copy") || action === "barcode_batch" ? <Printer size={18} /> : <Check size={18} />}{busy ? "Saving securely…" : action.includes("copy") || action === "barcode_batch" ? "Print document" : "Confirm operation"}</button>
  </form></section></div>;
}

function InfoModal({ title, icon: Icon, onClose, children }: { title: string; icon: LucideIcon; onClose: () => void; children: React.ReactNode }) { return <div className="modal-layer"><button className="modal-backdrop" onClick={onClose} /><section className="suite-modal suite-info-modal"><header><div><span><Icon size={14} /> LIVE INFORMATION</span><h2>{title}</h2><p>Read-only operational information</p></div><button onClick={onClose}><X size={19} /></button></header>{children}</section></div>; }
function Warning({ children }: { children: React.ReactNode }) { return <p className="suite-warning"><ShieldCheck size={15} />{children}</p>; }
function FieldInput({ name, label, type = "text", placeholder, required, min, max, step, defaultValue, minLength }: { name: string; label: string; type?: string; placeholder?: string; required?: boolean; min?: string; max?: string; step?: string; defaultValue?: string; minLength?: number }) { return <label className="suite-field"><span>{label}</span><input name={name} type={type} placeholder={placeholder} required={required} min={min} max={max} step={step} defaultValue={defaultValue} minLength={minLength} /></label>; }
function FieldSelect({ name, label, options, required, value, defaultValue, onChange, disabled }: { name: string; label: string; options: Array<{ value: string; label: string }>; required?: boolean; value?: string; defaultValue?: string; onChange?: (value: string) => void; disabled?: boolean }) { return <label className="suite-field"><span>{label}</span><select name={name} required={required} value={value} defaultValue={value === undefined ? defaultValue || "" : undefined} onChange={(event) => onChange?.(event.target.value)} disabled={disabled}><option value="">Select</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }
const paymentOptions = [{ value: "cash", label: "Cash" }, { value: "upi", label: "UPI" }, { value: "card", label: "Card" }, { value: "bank_transfer", label: "Bank transfer" }, { value: "credit", label: "Credit / adjustment" }, { value: "other", label: "Other" }];

function dateInRange(iso: string, from: string, to: string) { const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso)); return (!from || date >= from) && (!to || date <= to); }

function buildReport(key: string, data: { products: Product[]; sales: Sale[]; purchases: Purchase[]; accounts: AccountEntry[]; returns: ReturnRecord[]; documents: BusinessDocument[]; customers: Customer[]; suppliers: Supplier[]; staff: Staff[] }, profit: ProfitSummary) {
  const salesTotal = data.sales.filter((row) => row.status === "completed").reduce((sum, row) => sum + row.grand_total, 0);
  const purchaseTotal = data.purchases.filter((row) => row.status !== "cancelled").reduce((sum, row) => sum + row.grand_total, 0);
  let title = "Sales register"; let columns = ["Date", "Invoice", "Status", "Items", "Total", "GST"]; let rows: Array<Array<string | number>> = data.sales.map((row) => [formatDate(row.created_at), row.invoice_no, row.status, row.item_count, row.grand_total, row.tax_total]);
  if (key === "price_list") { title = "Product price list"; columns = ["Product", "Tamil", "Barcode", "Category", "MRP", "Sale price", "GST %"]; rows = data.products.map((row) => [row.name, row.tamil, row.barcode || "—", row.category || "General", row.mrp, row.price, row.gst]); }
  else if (["purchase","purchase_register"].includes(key)) { title = "Purchase register"; columns = ["Date", "Purchase", "Supplier invoice", "Status", "Total", "Balance"]; rows = data.purchases.map((row) => [row.invoice_date, row.purchase_no, row.supplier_invoice_no || "—", row.status, row.grand_total, row.balance_due]); }
  else if (["accounts","refunds"].includes(key)) { title = key === "refunds" ? "Refund register" : "Accounts register"; columns = ["Date", "Document", "Type", "Party", "Method", "Amount", "Status"]; rows = data.accounts.filter((row) => key !== "refunds" || row.entry_type === "refund").map((row) => [row.entry_date, row.account_no, row.entry_type.replaceAll("_", " "), getRelationName(row.customers) || getRelationName(row.suppliers) || row.party_type, row.payment_method, row.amount, row.status]); }
  else if (key === "inventory") { title = "Inventory valuation"; columns = ["Product", "Barcode", "Category", "Stock", "Sale price", "Stock value", "Status"]; rows = data.products.map((row) => [row.name, row.barcode, row.category, row.stock, row.price, Number((row.stock * row.price).toFixed(2)), row.stock <= 0 ? "Out of stock" : row.stock <= 10 ? "Low" : "Healthy"]); }
  else if (["earning","gp"].includes(key)) { title = key === "gp" ? "Gross profit report" : "Earning statement"; columns = ["Metric", "Amount"]; rows = [["Net sales", profit.sales], ["Cost of goods sold", profit.cost], ["Gross profit", profit.gross_profit], ["Gross margin %", profit.margin_percent]]; }
  else if (key === "gst") { title = "GST summary"; columns = ["Tax stream", "Tax amount", "Taxable document value"]; rows = [["Output GST — Sales", data.sales.reduce((sum, row) => sum + row.tax_total, 0), salesTotal], ["Input GST — Purchases", data.purchases.reduce((sum, row) => sum + safeNumber(row.tax_total), 0), purchaseTotal]]; }
  else if (key === "customer") { title = "Customer activity"; columns = ["Customer", "Phone", "Visits", "Lifetime value", "Outstanding", "Loyalty points"]; rows = data.customers.map((row) => [row.name, row.phone || "—", row.visit_count, row.lifetime_value, row.outstanding_balance, row.loyalty_points]); }
  else if (key === "product") { title = "Product master brief"; columns = ["Product", "Tamil", "Barcode", "Category", "Stock", "Price", "GST %"]; rows = data.products.map((row) => [row.name, row.tamil, row.barcode, row.category, row.stock, row.price, row.gst]); }
  else if (["control","events"].includes(key)) { title = "Control & event log"; columns = ["Date", "Document", "Operation", "Status", "Amount"]; rows = data.documents.map((row) => [row.document_date, row.document_no, row.document_type.replaceAll("_", " "), row.status, row.amount]); }
  else if (key === "top") { title = "Top bills"; columns = ["Invoice", "Date", "Items", "Amount", "Status"]; rows = [...data.sales].sort((a, b) => b.grand_total - a.grand_total).map((row) => [row.invoice_no, formatDate(row.created_at), row.item_count, row.grand_total, row.status]); }
  else if (key === "hourly") { const hourly = new Map<string, { count: number; amount: number }>(); data.sales.forEach((row) => { const hour = new Date(row.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", hour12: true }); const current = hourly.get(hour) || { count: 0, amount: 0 }; hourly.set(hour, { count: current.count + 1, amount: current.amount + row.grand_total }); }); title = "Hourly sales"; columns = ["Hour", "Bills", "Sales amount"]; rows = Array.from(hourly).map(([hour, value]) => [hour, value.count, value.amount]); }
  else if (key === "users") { title = "User brief"; columns = ["Staff", "Role", "Status", "Added"]; rows = data.staff.map((row) => [row.display_name || "Alsa Staff", row.role.replaceAll("_", " "), row.active ? "Active" : "Disabled", formatDate(row.created_at)]); }
  else if (key === "daily") { const daily = new Map<string, { count: number; amount: number }>(); data.sales.forEach((row) => { const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(row.created_at)); const current = daily.get(day) || { count: 0, amount: 0 }; daily.set(day, { count: current.count + 1, amount: current.amount + row.grand_total }); }); title = "Daily tracking"; columns = ["Date", "Bills", "Sales amount"]; rows = Array.from(daily).sort().reverse().map(([day, value]) => [day, value.count, value.amount]); }
  else if (key === "returns") { title = "Sales & purchase returns"; columns = ["Date", "Return", "Source", "Type", "Amount", "Reason"]; rows = data.returns.map((row) => [formatDate(row.created_at), row.document_no, row.source_no, row.kind, row.total_amount, row.reason || "—"]); }
  else if (["orders","delivery"].includes(key)) { title = key === "delivery" ? "Home delivery report" : "Order management report"; columns = ["Date", "Document", "Type", "Status", "Amount"]; rows = data.documents.filter((row) => key !== "delivery" ? ["quotation","home_delivery"].includes(row.document_type) : row.document_type === "home_delivery").map((row) => [row.document_date, row.document_no, row.document_type.replaceAll("_", " "), row.status, row.amount]); }
  else if (key === "pivot") { title = "Pivot-ready export"; columns = ["Date", "Source", "Document", "Type", "Status", "Amount"]; rows = [...data.sales.map((row) => [formatDate(row.created_at), "Sales", row.invoice_no, "sale", row.status, row.grand_total]), ...data.purchases.map((row) => [row.invoice_date, "Purchase", row.purchase_no, "purchase", row.status, row.grand_total]), ...data.accounts.map((row) => [row.entry_date, "Accounts", row.account_no, row.entry_type, row.status, row.amount])]; }
  return { title, columns, rows, summary: [{ label: "Sales", value: currency(salesTotal) }, { label: "Gross profit", value: currency(profit.gross_profit) }, { label: "Margin", value: `${profit.margin_percent.toFixed(1)}%` }, { label: "Purchases", value: currency(purchaseTotal) }, { label: "Rows", value: String(rows.length) }] };
}

function downloadCsv(filename: string, columns: string[], rows: Array<Array<string | number>>) { const csv = [columns, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n"); downloadBlob(filename, new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" })); }
function downloadJson(filename: string, value: unknown) { downloadBlob(filename, new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })); }
function downloadBlob(filename: string, blob: Blob) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }
function escapeHtml(value: unknown) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char] || char)); }
function openPrint(title: string, body: string) { const popup = window.open("", "_blank", "width=900,height=760"); if (!popup) throw new Error("Allow pop-ups to print this document"); popup.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title><style>body{font:14px Arial;color:#14221b;padding:32px}h1{margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{padding:9px;border-bottom:1px solid #ddd;text-align:left}.total{font-size:20px;font-weight:800;text-align:right;margin-top:20px}.muted{color:#65736b}.label{display:inline-block;border:1px solid #bbb;padding:12px;margin:6px;width:210px;text-align:center;break-inside:avoid}.label svg{width:190px;height:76px}</style></head><body>${body}<script>window.onload=()=>window.print()</script></body></html>`); popup.document.close(); }
async function printSale(supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>, storeId: string, saleId: string) { const [saleResult, itemsResult] = await Promise.all([supabase.from("sales").select("invoice_no,created_at,status,subtotal,discount_total,tax_total,grand_total,paid_total,balance_due").eq("store_id", storeId).eq("id", saleId).single(), supabase.from("sale_items").select("product_name,quantity,unit_price,gst_rate,line_total").eq("store_id", storeId).eq("sale_id", saleId)]); if (saleResult.error) throw saleResult.error; if (itemsResult.error) throw itemsResult.error; const sale = saleResult.data; const rows = (itemsResult.data || []).map((row) => `<tr><td>${escapeHtml(row.product_name)}</td><td>${row.quantity}</td><td>${currency(Number(row.unit_price))}</td><td>${row.gst_rate}%</td><td>${currency(Number(row.line_total))}</td></tr>`).join(""); openPrint(String(sale.invoice_no), `<h1>Alsa Store</h1><p class="muted">Bill copy · ${escapeHtml(sale.invoice_no)} · ${formatDate(String(sale.created_at))} · ${escapeHtml(sale.status)}</p><table><thead><tr><th>Product</th><th>Qty</th><th>Rate</th><th>GST</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><p class="total">Total ${currency(Number(sale.grand_total))}</p>`); }
async function printPurchase(supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>, storeId: string, purchaseId: string) { const [head, items] = await Promise.all([supabase.from("purchases").select("purchase_no,supplier_invoice_no,invoice_date,status,grand_total").eq("store_id", storeId).eq("id", purchaseId).single(), supabase.from("purchase_items").select("quantity,unit_cost,gst_rate,line_total,products(name_en)").eq("store_id", storeId).eq("purchase_id", purchaseId)]); if (head.error) throw head.error; if (items.error) throw items.error; const rows = (items.data || []).map((row) => `<tr><td>${escapeHtml(Array.isArray(row.products) ? row.products[0]?.name_en : (row.products as { name_en?: string } | null)?.name_en)}</td><td>${row.quantity}</td><td>${currency(Number(row.unit_cost))}</td><td>${row.gst_rate}%</td><td>${currency(Number(row.line_total))}</td></tr>`).join(""); openPrint(String(head.data.purchase_no), `<h1>Alsa Store</h1><p class="muted">Purchase copy · ${escapeHtml(head.data.purchase_no)} · Supplier ref ${escapeHtml(head.data.supplier_invoice_no || "—")}</p><table><thead><tr><th>Product</th><th>Qty</th><th>Cost</th><th>GST</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><p class="total">Total ${currency(Number(head.data.grand_total))}</p>`); }
function printAccount(entry: AccountEntry) { openPrint(entry.account_no, `<h1>Alsa Store</h1><p class="muted">Account document copy</p><table><tbody><tr><th>Document</th><td>${escapeHtml(entry.account_no)}</td></tr><tr><th>Date</th><td>${escapeHtml(entry.entry_date)}</td></tr><tr><th>Type</th><td>${escapeHtml(entry.entry_type)}</td></tr><tr><th>Method</th><td>${escapeHtml(entry.payment_method)}</td></tr><tr><th>Status</th><td>${escapeHtml(entry.status)}</td></tr></tbody></table><p class="total">${currency(entry.amount)}</p>`); }

function ean13Svg(raw: string) { let code = raw.replace(/\D/g, ""); if (code.length === 12) { const sum = code.split("").reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0); code += String((10 - (sum % 10)) % 10); } if (code.length !== 13) return `<div style="font:700 20px monospace;padding:22px">${escapeHtml(raw)}</div>`; const L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"]; const G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"]; const R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"]; const P = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"]; let bits = "101"; const parity = P[Number(code[0])]; for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === "L" ? L : G)[Number(code[i])]; bits += "01010"; for (let i = 7; i <= 12; i++) bits += R[Number(code[i])]; bits += "101"; const bars = bits.split("").map((bit, index) => bit === "1" ? `<rect x="${index * 2}" y="0" width="2" height="64"/>` : "").join(""); return `<svg viewBox="0 0 190 76" role="img"><g fill="#111">${bars}</g><text x="95" y="75" text-anchor="middle" font-family="monospace" font-size="11">${code}</text></svg>`; }
function printBarcodeLabels(product: Product, copies: number) { const labels = Array.from({ length: copies }, () => `<div class="label"><strong>${escapeHtml(product.name)}</strong>${ean13Svg(product.barcode)}<div>${currency(product.price)} · ${escapeHtml(product.unit)}</div></div>`).join(""); openPrint(`${product.name} labels`, `<h1>Alsa Store · Barcode labels</h1><p class="muted">${copies} labels</p><div>${labels}</div>`); }
