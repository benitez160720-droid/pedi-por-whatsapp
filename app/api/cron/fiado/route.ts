// Aviso semanal de fiado vencido y de clientes que dejaron de venir (Vercel Cron, lunes 09:00 hora Argentina).
// Solo avisa al dueño; nunca escribe a los clientes.
import { NextResponse } from "next/server";
import webpush from "web-push";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { armarAvisoFiado, armarAvisoFuga } from "@/lib/fiado";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Aviso = { kiosco: string; n_clientes: number; monto: number };
type Fuga = { kiosco: string; clientes: number };

export async function GET(req: Request) {
  // Secreto propio (no x-vercel-cron, que cualquiera puede mandar).
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "no_autorizado" }, { status: 401 });
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  // Idempotente por kiosco y semana: si se dispara dos veces, no repite el aviso de fiado.
  const { data, error } = await admin.rpc("fiado_avisos_semanales", { p_dias: 30 });
  if (error) return NextResponse.json({ error: "db" }, { status: 500 });

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:hola@pedi.app",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  const contar = { enviados: 0, fallos: 0 };
  for (const a of (data ?? []) as Aviso[]) {
    const aviso = armarAvisoFiado({ clientes: a.n_clientes, monto: Number(a.monto), dias: 30 });
    await enviarAKiosco(admin, a.kiosco, aviso, contar);
  }

  // Plan 3.3: clientes que dejaron de venir (3 compras o más y sin volver hace 45 días). Un aviso aparte por kiosco.
  let fugaAvisados = 0;
  // Idempotente por kiosco y semana (tabla avisos_fuga): una segunda corrida en la misma semana no devuelve nada.
  const { data: fuga, error: errFuga } = await admin.rpc("fuga_avisos_semanales");
  if (!errFuga) {
    for (const f of (fuga ?? []) as Fuga[]) {
      fugaAvisados++;
      await enviarAKiosco(admin, f.kiosco, armarAvisoFuga({ clientes: Number(f.clientes), dias: 45 }), contar);
    }
  }
  return NextResponse.json({ kioscos_avisados: (data ?? []).length, fuga_avisados: fugaAvisados, enviados: contar.enviados, fallos: contar.fallos });
}

// Manda un aviso a todas las suscripciones push del kiosco. Borra las suscripciones muertas (404/410).
async function enviarAKiosco(
  admin: SupabaseClient,
  kiosco: string,
  aviso: { title: string; body: string; url: string },
  contar: { enviados: number; fallos: number },
) {
  try {
    const { data: subs } = await admin.from("push_suscripciones").select("id,endpoint,p256dh,auth_secret").eq("kiosco_id", kiosco);
    const payload = JSON.stringify(aviso);
    await Promise.all((subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_secret } }, payload);
        contar.enviados++;
      } catch (e: unknown) {
        const code = (e as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) await admin.from("push_suscripciones").delete().eq("id", s.id);
        else contar.fallos++;
      }
    }));
  } catch {
    contar.fallos++;
  }
}
