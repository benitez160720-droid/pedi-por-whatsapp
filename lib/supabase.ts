import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type Kiosco = { id: string; nombre: string; slug: string; whatsapp: string; direccion: string | null; acepta_envio: boolean; sellos_por_premio: number; premio: string; abierto: boolean; horario: string | null; pedido_minimo: number; costo_envio: number; medios_pago: string[] };
export type Producto = { id: string; kiosco_id: string; barcode: string | null; nombre: string; categoria: string; precio: number; disponible: boolean };
export type Pedido = { id: string; numero: number; cliente_nombre: string; cliente_telefono: string; modalidad: "retiro" | "envio"; direccion: string | null; notas: string | null; total: number; estado: "pendiente" | "confirmado" | "entregado" | "cancelado"; created_at: string; medio_pago: string; costo_envio: number };
