import { supabase } from "./supabase";

export type ProductoEncontrado = { nombre: string; imagen_url?: string | null; fuente: "global" | "openfoodfacts" };

/** Busca un código en la base propia (compartida entre kioscos) y después en Open Food Facts. */
export async function buscarPorBarcode(barcode: string): Promise<ProductoEncontrado | null> {
  const { data: g } = await supabase.from("productos_globales").select("nombre,marca,imagen_url").eq("barcode", barcode).maybeSingle();
  if (g) return { nombre: [g.nombre, g.marca].filter(Boolean).join(" ").trim(), imagen_url: g.imagen_url, fuente: "global" };

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,brands,image_front_small_url`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = await r.json();
    const nombre = [j?.product?.product_name, j?.product?.brands?.split(",")[0]].filter(Boolean).join(" ").trim();
    if (j?.status === 1 && nombre) return { nombre, imagen_url: j.product.image_front_small_url ?? null, fuente: "openfoodfacts" };
  } catch { /* sin red o timeout: se carga a mano */ }
  return null;
}

/** Aporta el producto a la base global (si ya existe, no pisa nada). */
export async function aportarAGlobal(barcode: string, nombre: string, fuente: "global" | "openfoodfacts" | "kiosco") {
  await supabase.from("productos_globales").upsert(
    { barcode, nombre, fuente: fuente === "global" ? "kiosco" : fuente },
    { onConflict: "barcode", ignoreDuplicates: true }
  );
}
