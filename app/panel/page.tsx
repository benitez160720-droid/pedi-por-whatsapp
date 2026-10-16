"use client";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, type Kiosco } from "@/lib/supabase";
import { normalizarTelefonoAR } from "@/lib/whatsapp";
import Productos from "@/components/Productos";
import Pedidos from "@/components/Pedidos";
import Fiado from "@/components/Fiado";
import Sellos from "@/components/Sellos";
import Precios from "@/components/Precios";
import Resumen from "@/components/Resumen";
import QrKiosco from "@/components/QrKiosco";

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
    const { data } = await supabase.from("kioscos").select("id,nombre,slug,whatsapp,direccion,acepta_envio,sellos_por_premio,premio").eq("owner_id", session.user.id).maybeSingle();
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
  return <Dueno kiosco={kiosco} />;
}

function CrearKiosco({ userId, onListo }: { userId: string; onListo: () => void }) {
  const [nombre, setNombre] = useState(""); const [slug, setSlug] = useState(""); const [wa, setWa] = useState(""); const [err, setErr] = useState("");
  async function crear() {
    const { error } = await supabase.from("kioscos").insert({ owner_id: userId, nombre, slug, whatsapp: normalizarTelefonoAR(wa) });
    if (error) setErr(error.code === "23505" ? "Ese link ya está usado, probá otro." : "Revisá los datos (el link: minúsculas, números y guiones)."); else onListo();
  }
  const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return (
    <>
      <h1>Creá tu kiosco</h1>
      <label>Nombre<input value={nombre} onChange={(e) => { setNombre(e.target.value); setSlug(slugify(e.target.value)); }} /></label>
      <label>Link de la tienda<input value={slug} onChange={(e) => setSlug(e.target.value)} /></label>
      <label>WhatsApp donde recibís pedidos<input value={wa} onChange={(e) => setWa(e.target.value)} inputMode="tel" /></label>
      {err && <p role="alert" style={{ color: "#c0392b" }}>{err}</p>}
      <button disabled={nombre.length < 2 || slug.length < 3 || wa.replace(/\D/g, "").length < 8} onClick={crear}>Crear</button>
    </>
  );
}

type Tab = "pedidos" | "productos" | "fiado" | "sellos" | "precios" | "resumen";
const TABS: [Tab, string][] = [["pedidos", "Pedidos"], ["productos", "Productos"], ["fiado", "Fiado"], ["sellos", "Sellos"], ["precios", "Precios"], ["resumen", "Resumen"]];

function Dueno({ kiosco }: { kiosco: Kiosco }) {
  const [tab, setTab] = useState<Tab>("pedidos");
  return (
    <>
      <div className="row"><h1>{kiosco.nombre}</h1><button className="sec" onClick={() => supabase.auth.signOut()}>Salir</button></div>
      <QrKiosco slug={kiosco.slug} nombre={kiosco.nombre} />
      <div className="tabs">
        {TABS.map(([k, label]) => (<button key={k} className={tab === k ? "" : "sec"} onClick={() => setTab(k)}>{label}</button>))}
      </div>
      {tab === "pedidos" && <Pedidos kiosco={kiosco} />}
      {tab === "productos" && <Productos kiosco={kiosco} />}
      {tab === "fiado" && <Fiado kiosco={kiosco} />}
      {tab === "sellos" && <Sellos kiosco={kiosco} />}
      {tab === "precios" && <Precios kiosco={kiosco} />}
      {tab === "resumen" && <Resumen kiosco={kiosco} onIr={setTab} />}
    </>
  );
}
