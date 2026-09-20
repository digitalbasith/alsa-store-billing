"use client";

import {
  Barcode,
  Boxes,
  FileSpreadsheet,
  IndianRupee,
  LoaderCircle,
  Mail,
  Package,
  Phone,
  Plus,
  ReceiptIndianRupee,
  ShieldCheck,
  Truck,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState, type FormEvent } from "react";

const tamilWords: Record<string, string> = {
  aavin:"ஆவின்", milk:"மில்க்", full:"ஃபுல்", cream:"க்ரீம்", bread:"பிரெட்", rice:"ரைஸ்",
  oil:"ஆயில்", salt:"சால்ட்", gold:"கோல்ட்", biscuits:"பிஸ்கட்ஸ்", biscuit:"பிஸ்கட்",
  classic:"கிளாசிக்", strong:"ஸ்ட்ராங்", teeth:"டீத்", fresh:"ஃப்ரெஷ்", red:"ரெட்",
  onion:"ஆனியன்", sunflower:"சன்ஃப்ளவர்", powder:"பவுடர்", power:"பவர்", plus:"பிளஸ்"
};
function transliterateWord(word: string) {
  const lower = word.toLowerCase();
  if (tamilWords[lower]) return tamilWords[lower];
  const consonants: Record<string,string> = { kh:"க",gh:"க",ch:"ச",sh:"ஷ",th:"த",dh:"த",ph:"ஃப",bh:"ப",ng:"ங",zh:"ழ",k:"க",g:"க",c:"ச",j:"ஜ",t:"ட",d:"ட",n:"ந",p:"ப",b:"ப",m:"ம",y:"ய",r:"ர",l:"ல",v:"வ",w:"வ",s:"ஸ",h:"ஹ",f:"ஃப",z:"ஸ",q:"க",x:"க்ஸ" };
  const vowels: Record<string,{solo:string,sign:string}> = {
    aa:{solo:"ஆ",sign:"ா"},ee:{solo:"ஈ",sign:"ீ"},oo:{solo:"ஊ",sign:"ூ"},ai:{solo:"ஐ",sign:"ை"},au:{solo:"ஔ",sign:"ௌ"},ea:{solo:"ஈ",sign:"ீ"},
    a:{solo:"அ",sign:""},i:{solo:"இ",sign:"ி"},u:{solo:"உ",sign:"ு"},e:{solo:"எ",sign:"ெ"},o:{solo:"ஒ",sign:"ொ"}
  };
  let out="", i=0;
  while(i<lower.length){
    if(!/[a-z]/.test(lower[i])){ out+=lower[i++]; continue; }
    let vk = Object.keys(vowels).find(v=>lower.startsWith(v,i));
    if(vk){ out+=vowels[vk].solo; i+=vk.length; continue; }
    let ck = Object.keys(consonants).sort((a,b)=>b.length-a.length).find(k=>lower.startsWith(k,i));
    if(!ck){ out+=lower[i++]; continue; }
    const base=consonants[ck]; i+=ck.length;
    vk=Object.keys(vowels).find(v=>lower.startsWith(v,i));
    if(vk){ out+=base+vowels[vk].sign; i+=vk.length; } else out+=base+"்";
  }
  return out;
}
export function englishToTamil(value: string) {
  return value.split(/(\s+|[-/])/).map(part => /^[A-Za-z]+$/.test(part) ? transliterateWord(part) : part).join("");
}

export type ActionMode = "product" | "customer" | "supplier" | "purchase" | "staff";

type ProductOption = { id: string; name: string; price: number; gst: number };
type SupplierOption = { id: string; name: string };

const titles: Record<ActionMode, { eyebrow: string; title: string; description: string }> = {
  product: { eyebrow: "PRODUCT MASTER", title: "Add supermarket product", description: "Create the product, barcode and opening stock together." },
  customer: { eyebrow: "CUSTOMER CRM", title: "Add customer", description: "Save contact, loyalty and credit identity." },
  supplier: { eyebrow: "VENDOR MASTER", title: "Add supplier", description: "Create a supplier for purchase and payable tracking." },
  purchase: { eyebrow: "STOCK RECEIPT", title: "Receive purchase", description: "Purchase document and stock update happen atomically." },
  staff: { eyebrow: "ACCESS CONTROL", title: "Invite staff", description: "Send a secure email invitation with the selected role." },
};

export function LiveActionModal({
  mode,
  products,
  suppliers,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  mode: ActionMode;
  products: ProductOption[];
  suppliers: SupplierOption[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (mode: ActionMode, data: FormData) => Promise<void>;
}) {
  const copy = titles[mode];
  const [productName, setProductName] = useState("");
  const [tamilName, setTamilName] = useState("");
  const [tamilManual, setTamilManual] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onSubmit(mode, new FormData(event.currentTarget));
  };

  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label={copy.title}>
    <button className="modal-backdrop" onClick={() => !busy && onClose()} />
    <section className="action-modal">
      <header className="action-modal-head"><div><span className="eyebrow"><ShieldCheck size={13} /> {copy.eyebrow}</span><h2>{copy.title}</h2><p>{copy.description}</p></div><button className="icon-button" type="button" onClick={onClose} disabled={busy}><X size={19} /></button></header>
      <form className="action-form" onSubmit={submit}>
        {mode === "product" && <>
          <div className="action-form-row"><label><span>Product name</span><div><Package size={17} /><input name="name" value={productName} onChange={(e) => { const next=e.target.value; setProductName(next); if(!tamilManual) setTamilName(englishToTamil(next)); }} placeholder="Aavin Milk" required /></div></label><label><span>Tamil name (auto / editable)</span><div><Package size={17} /><input name="tamil" value={tamilName} onChange={(e) => { setTamilManual(true); setTamilName(e.target.value); }} placeholder="Automatically transliterated" /></div></label></div>
          <div className="action-form-row"><Field name="barcode" label="Barcode (optional)" icon={Barcode} placeholder="Optional" /><Field name="category" label="Category (optional)" icon={Boxes} placeholder="Optional — General" /></div>
          <div className="action-form-row"><Field name="price" label="Sale price" icon={IndianRupee} type="number" min="0" step="0.01" required /><Field name="mrp" label="MRP" icon={IndianRupee} type="number" min="0" step="0.01" required /></div>
          <div className="action-form-row"><Field name="stock" label="Opening stock (count)" icon={Boxes} type="number" min="0" step="1" defaultValue="0" required /><Field name="gst" label="GST % (optional)" icon={FileSpreadsheet} type="number" min="0" max="100" step="0.01" placeholder="Optional — defaults to 0" /></div>
        </>}
        {(mode === "customer" || mode === "supplier") && <>
          <Field name="name" label={mode === "customer" ? "Customer name" : "Supplier name"} icon={mode === "customer" ? UserRound : Truck} placeholder={mode === "customer" ? "R. Kavitha" : "Sri Lakshmi Distributors"} required />
          <div className="action-form-row"><Field name="phone" label="Phone" icon={Phone} placeholder="+91" /><Field name="email" label="Email" icon={Mail} type="email" placeholder="name@example.com" /></div>
          <Field name="gstin" label="GSTIN (optional)" icon={FileSpreadsheet} placeholder="33ABCDE1234F1Z5" />
        </>}
        {mode === "purchase" && <>
          <label><span>Supplier</span><div><Truck size={17} /><select name="supplier_id" defaultValue=""><option value="">Cash / unregistered supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></div></label>
          <Field name="supplier_invoice_no" label="Supplier invoice number" icon={ReceiptIndianRupee} placeholder="INV-2048" />
          <label><span>Product</span><div><Package size={17} /><select name="product_id" required defaultValue=""><option value="" disabled>Select a product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></div></label>
          <div className="action-form-row three"><Field name="quantity" label="Quantity" icon={Boxes} type="number" min="0.001" step="0.001" required /><Field name="unit_cost" label="Unit cost" icon={IndianRupee} type="number" min="0" step="0.01" required /><Field name="gst_rate" label="GST %" icon={FileSpreadsheet} type="number" min="0" max="100" step="0.01" defaultValue="0" required /></div>
          <div className="action-form-row"><Field name="payment_amount" label="Paid now" icon={IndianRupee} type="number" min="0" step="0.01" defaultValue="0" required /><Field name="batch_no" label="Batch number" icon={Barcode} placeholder="Optional" /></div>
        </>}
        {mode === "staff" && <>
          <Field name="display_name" label="Staff name" icon={UserRound} placeholder="Kavitha R" required />
          <Field name="email" label="Staff email" icon={Mail} type="email" placeholder="staff@example.com" required />
          <label><span>Access role</span><div><ShieldCheck size={17} /><select name="role" defaultValue="cashier"><option value="cashier">Cashier</option><option value="inventory_manager">Inventory Manager</option><option value="accountant">Accountant</option><option value="staff">Staff</option><option value="admin">Admin</option></select></div></label>
        </>}
        {error && <p className="auth-alert error">{error}</p>}
        <button className="auth-submit" disabled={busy}>{busy ? <LoaderCircle size={18} className="spin" /> : <Plus size={18} />}{busy ? "Saving securely…" : copy.title}</button>
      </form>
    </section>
  </div>;
}

function Field({
  name,
  label,
  icon: Icon,
  type = "text",
  placeholder,
  required,
  min,
  max,
  step,
  defaultValue,
}: {
  name: string;
  label: string;
  icon: LucideIcon;
  type?: string;
  placeholder?: string;
  required?: boolean;
  min?: string;
  max?: string;
  step?: string;
  defaultValue?: string;
}) {
  return <label><span>{label}</span><div><Icon size={17} /><input name={name} type={type} placeholder={placeholder} required={required} min={min} max={max} step={step} defaultValue={defaultValue} /></div></label>;
}
