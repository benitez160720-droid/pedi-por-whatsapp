"use client";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, type Kiosco } from "@/lib/supabase";
import { normalizarTelefonoAR } from "@/lib/whatsapp";
import { estadoTienda, textoApertura } from "@/lib/horario";
import Link from "next/link";
import Productos from "@/components/Productos";
import Pedidos from "@/components/Pedidos";
import Fiado from "@/components/Fiado";
import Sellos from "@/components/Sellos";
import Precios from "@/components/Precios";
import Avisos from "@/components/Avisos";
import Caja from "@/components/Caja";
import Resumen from "@/components/Resumen";
import QrKiosco from "@/components/QrKiosco";
import MiKiosco from "@/components/MiKiosco";

export default function Panel() {
  const [session, setSession] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(true);
  const [kiosco, setKiosco] = useState<Kiosco | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setCargando(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const cargarKiosco = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase.from("kioscos").select("id,nombre,slug,whatsapp,direccion,acepta_envio,sellos_por_premio,premio,abierto,horario,pedido_minimo,costo_envio,medios_pago,horario_auto,horarios").eq("owner_id", session.user.id).maybeSingle();
    setKiosco((data as Kiosco) ?? null);
  }, [session]);
  useEffect(() => { cargarKiosco(); }, [cargarKiosco]);

  if (cargando) return <p>Cargando…</p>;
  if (!session) return (
    <>
      <h1>Panel del kiosco</h1>
      <button onClick={() => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/panel` } })}>Entrar con Google</button>
    </>
  );
  if (!kiosco) return <CrearKiosco userId={session.user.id} onListo={cargarKiosco} />;
  return <Dueno kiosco={kiosco} recargar={cargarKiosco} />;
}

function CrearKiosco({ userId, onListo }: { userId: string; onListo: () => void }) {
  const [nombre, setNombre] = useState(""); const [slug, setSlug] = useState(""); const [wa, setWa] = useState(""); const [dir, setDir] = useState(""); const [err, setErr] = useState(""); const [acepto, setAcepto] = useState(false);
  async function crear() {
    const { error } = await supabase.from("kioscos").insert({ owner_id: userId, nombre, slug, whatsapp: normalizarTelefonoAR(wa), direccion: dir.trim() || null });
    if (error) setErr(error.code === "23505" ? "Ese link ya está usado, probá otro." : "Revisá los datos (el link: minúsculas, números y guiones)."); else onListo();
  }
  const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return (
    <>
      <h1>Creá tu kiosco</h1>
      <label>Nombre<input value={nombre} onChange={(e) => { setNombre(e.target.value); setSlug(slugify(e.target.value)); }} /></label>
      <label>Link de la tienda<input value={slug} onChange={(e) => setSlug(e.target.value)} /></label>
      <label>WhatsApp donde recibís pedidos<input value={wa} onChange={(e) => setWa(e.target.value)} inputMode="tel" /></label>
      <label>Dirección (opcional)<input value={dir} onChange={(e) => setDir(e.target.value)} autoComplete="street-address" /></label>
      <label className="mut" style={{ display: "block", margin: "8px 0" }}>
        <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} style={{ width: "auto", marginRight: 8 }} />
        Acepto los <Link href="/terminos" target="_blank">Términos y condiciones</Link> y la <Link href="/privacidad" target="_blank">Política de privacidad</Link>.
      </label>
      {err && <p role="alert" style={{ color: "#c0392b" }}>{err}</p>}
      <button disabled={!acepto || nombre.length < 2 || slug.length < 3 || wa.replace(/\D/g, "").length < 8} onClick={crear}>Crear</button>
    </>
  );
}

type Tab = "pedidos" | "productos" | "fiado" | "caja" | "sellos" | "precios" | "resumen" | "local";
type Grupo = { titulo: string; items: [Tab, string, string][] };
// Ícono (trazo) por sección, para el menú lateral.
const ICONOS: Record<Tab, string> = {
  pedidos: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 3h6v4H9zM9 12l2 2 4-4",
  caja: "M3 7h18v12H3zM3 7l3-4h12l3 4M8 13h.01M12 13h4",
  fiado: "M4 4h13a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3zM8 9h8M8 13h5",
  productos: "M21 16V8l-9-5-9 5v8l9 5zM3.3 7.5 12 12.5l8.7-5M12 22V12.5",
  precios: "M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2.8 12.8A2 2 0 0 1 2.2 11.4l.5-7.7a1 1 0 0 1 1-1l7.7-.5a2 2 0 0 1 1.4.6l7.8 7.8a2 2 0 0 1 0 2.8zM7.5 7.5h.01",
  sellos: "M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z",
  resumen: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  local: "M3 10l1.5-6h15L21 10M4 10v10h16V10M9 20v-6h6v6",
};
const GRUPOS: Grupo[] = [
  { titulo: "Vender", items: [["caja", "Caja", "Punto de venta"], ["pedidos", "Pedidos", "WhatsApp y tienda"], ["fiado", "Fiado", "Cuentas corrientes"]] },
  { titulo: "Catálogo", items: [["productos", "Productos", "Stock y fotos"], ["precios", "Precios", "Ajustes masivos"]] },
  { titulo: "Negocio", items: [["resumen", "Resumen", "Ventas y balance"], ["sellos", "Sellos", "Fidelización"], ["local", "Mi local", "Datos y horarios"]] },
];

function Dueno({ kiosco, recargar }: { kiosco: Kiosco; recargar: () => void }) {
  const [tab, setTab] = useState<Tab>("pedidos");
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 30000); return () => clearInterval(t); }, []);
  const estado = estadoTienda(kiosco, ahora);
  const abierta = estado === "abierta";
  const detalle = estado === "fuera_de_horario" ? `Fuera de horario${textoApertura(kiosco.horarios ?? {}, ahora) ? ` · ${textoApertura(kiosco.horarios, ahora)}` : ""}`
    : estado === "pausada" ? (kiosco.horario_auto ? "Pausada: no recibe pedidos aunque esté en horario" : "Cerrada") : kiosco.horario_auto ? "Abierta (según tu horario)" : "Abierta";
  return (
    <div className="panel-shell">
      <aside className="side" aria-label="Menú del panel">
        <div className="side-marca">
          <span className="side-nombre">{kiosco.nombre}</span>
          <span className={`side-estado${abierta ? " on" : ""}`}>{abierta ? "Tienda abierta" : "Tienda cerrada"}</span>
        </div>
        <nav className="side-nav">
          {GRUPOS.map((g) => (
            <div className="side-grupo" key={g.titulo}>
              <span className="side-titulo">{g.titulo}</span>
              {g.items.map(([k, label, sub]) => (
                <button key={k} className={`side-item${tab === k ? " on" : ""}`} onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined} title={sub}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONOS[k]} /></svg>
                  <span className="side-label">{label}<small>{sub}</small></span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-pie">
          <button className="sec" onClick={async () => { await supabase.from("kioscos").update({ abierto: !kiosco.abierto }).eq("id", kiosco.id); recargar(); }}>
            {kiosco.horario_auto ? (kiosco.abierto ? "Pausar tienda" : "Reanudar tienda") : kiosco.abierto ? "Cerrar tienda" : "Abrir tienda"}
          </button>
          <button className="sec" onClick={() => supabase.auth.signOut()}>Salir</button>
        </div>
      </aside>
      <section className="panel-main">
        {tab !== "caja" && (
          <>
            <div className="card row"><span>Tienda: <b className={abierta ? "ok" : undefined} style={abierta ? undefined : { color: "#c0392b" }}>{detalle}</b></span></div>
            <Avisos kiosco={kiosco} />
            <QrKiosco slug={kiosco.slug} nombre={kiosco.nombre} />
          </>
        )}
        {tab === "pedidos" && <Pedidos kiosco={kiosco} />}
        {tab === "productos" && <Productos kiosco={kiosco} />}
        {tab === "fiado" && <Fiado kiosco={kiosco} />}
        {tab === "caja" && <Caja kiosco={kiosco} />}
        {tab === "sellos" && <Sellos kiosco={kiosco} />}
        {tab === "precios" && <Precios kiosco={kiosco} />}
        {tab === "resumen" && <Resumen kiosco={kiosco} onIr={setTab} />}
        {tab === "local" && <MiKiosco kiosco={kiosco} onGuardado={recargar} />}
      </section>
    </div>
  );
}
