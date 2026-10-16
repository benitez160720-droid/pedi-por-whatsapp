import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import Tienda from "@/components/Tienda";
import type { Kiosco, Producto } from "@/lib/supabase";

export const revalidate = 30;

export default async function TiendaPage({ params }: { params: { slug: string } }) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: kiosco } = await sb.from("kioscos").select("id,nombre,slug,whatsapp,direccion,acepta_envio").eq("slug", params.slug).maybeSingle();
  if (!kiosco) notFound();
  const { data: productos } = await sb.from("productos").select("id,kiosco_id,barcode,nombre,categoria,precio,disponible").eq("kiosco_id", kiosco.id).eq("disponible", true).order("categoria").order("nombre");
  return <Tienda kiosco={kiosco as Kiosco} productos={(productos ?? []) as Producto[]} />;
}
