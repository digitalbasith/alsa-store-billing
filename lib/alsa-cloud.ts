import type { SupabaseClient } from "@supabase/supabase-js";

export type CatalogInput = {
  name: string;
  tamil?: string;
  category: string;
  unit: string;
  price: number;
  mrp: number;
  stock: number;
  gst: number;
  barcode: string;
  icon?: string;
  tint?: string;
};

function makeSku(item: CatalogInput, index: number): string {
  const source = item.barcode || item.name;
  const cleaned = source.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `AS-${cleaned || index + 1}`.slice(0, 48);
}

/**
 * Upserts catalogue rows through the signed-in user's RLS permissions.
 * No service key is used in the browser.
 */
export async function syncCatalogToCloud(
  supabase: SupabaseClient,
  storeId: string,
  items: CatalogInput[],
): Promise<number> {
  if (!items.length) return 0;

  const categoryNames = Array.from(new Set(items.map((item) => item.category.trim() || "General")));
  const { data: categoryRows, error: categoryError } = await supabase
    .from("categories")
    .upsert(
      categoryNames.map((name, index) => ({
        store_id: storeId,
        name_en: name,
        sort_order: index,
        active: true,
      })),
      { onConflict: "store_id,name_en" },
    )
    .select("id,name_en");

  if (categoryError) throw categoryError;

  const categoryIds = new Map(
    (categoryRows ?? []).map((row) => [String(row.name_en), String(row.id)]),
  );

  const payload = items.map((item, index) => {
    const category = item.category.trim() || "General";
    const sellingPrice = Math.max(0, Number(item.price) || 0);
    const mrp = Math.max(sellingPrice, Number(item.mrp) || sellingPrice);

    return {
      store_id: storeId,
      category_id: categoryIds.get(category) ?? null,
      sku: makeSku(item, index),
      name_en: item.name.trim(),
      name_ta: item.tamil?.trim() || null,
      unit: item.unit.trim() || "unit",
      purchase_price: Number((sellingPrice * 0.78).toFixed(2)),
      selling_price: sellingPrice,
      mrp,
      gst_rate: Math.min(100, Math.max(0, Number(item.gst) || 0)),
      current_stock: Math.max(0, Math.round(Number(item.stock) || 0)),
      minimum_stock: Math.min(10, Math.max(0, Math.round(Number(item.stock) || 0))),
      active: true,
      metadata: { icon: item.icon || "📦", tint: item.tint || "blue" },
    };
  });

  const { data: productRows, error: productError } = await supabase
    .from("products")
    .upsert(payload, { onConflict: "store_id,sku" })
    .select("id,sku");

  if (productError) throw productError;

  const productBySku = new Map(
    (productRows ?? []).map((row) => [String(row.sku), String(row.id)]),
  );
  const barcodes = items
    .map((item, index) => ({
      store_id: storeId,
      product_id: productBySku.get(makeSku(item, index)),
      barcode: item.barcode.trim(),
      is_primary: true,
    }))
    .filter((row): row is { store_id: string; product_id: string; barcode: string; is_primary: boolean } =>
      Boolean(row.product_id && row.barcode),
    );

  if (barcodes.length) {
    const { error: barcodeError } = await supabase
      .from("product_barcodes")
      .upsert(barcodes, { onConflict: "store_id,barcode" });
    if (barcodeError) throw barcodeError;
  }

  return productRows?.length ?? 0;
}
