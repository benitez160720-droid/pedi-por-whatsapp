"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase, type Kiosco } from "@/lib/supabase";
import { linkWhatsApp, normalizarTelefonoAR } from "@/lib/whatsapp";

type Cli = { id: string; nombre: string; telefono: string; sellos_disponibles: number };
type Sello = { id: string; origen: string; anulado: boolean; created_at: string };

export default function Sellos({ kiosco }: { kiosco: Kiosco }) {
  const [n, setN] = useState(kiosco.sellos_por_premio);
  const [premio, setPremio] = useState(kiosco.premio);
  const [lista, setLista] = useState<Cli[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [sellos, setSellos] = useState<Sello[]>([]);
  const [tel, setTel] = useState(""); const [nombre, setNombre] = useState("");
  const [msg, setMsg] = useState("");

  const cargar = useCallback(async () => {
    const { data } = await supabase.from("clientes_sellos").select("*").eq("kiosco_id", kiosco.id).gt("sellos_disponibles", 0).order("sellos_disponibles", { ascending: false });
    setLista((data ?? []) as Cli[]);
  }, [kiosco.id]);
  useEffect(() => { cargar(); }, [cargar]);

  async function guardarConfig() {
    const { error } = await supabase.from("kioscos").update({ sellos_por_premio: n, premio: premio.trim() || "Un premio de la casa" }).eq("id", kiosco.id);
    setMsg(error ? "No se pudo guardar el premio (entre 2 y 100 sellos)." : "Premio guardado ✔");
  }

  async function sumarSello(clienteId: string) {
    const { error } = await supabase.from("sellos").insert({ kiosco_id: kiosco.id, cliente_id: clienteId, origen: "mostrador" });
    if (error) { setMsg("No se pudo sumar el sello."); return false; }
    return true;
  }

  async function sumarPorTelefono() {
    setMsg("");
    const t = normalizarTelefonoAR(tel);
    let { data: c } = await supabase.from("clientes").select("id").eq("kiosco_id", kiosco.id).eq("telefono", t).maybeSingle();
    if (!c) {
      const ins = await supabase.from("clientes").insert({ kiosco_id: kiosco.id, nombre: nombre.trim() || "Cliente", telefono: t }).select("id").single();
      if (ins.error) { setMsg("No se pudo crear el cliente."); return; }
      c = ins.data;
    }
    if (await sumarSello(c!.id)) { setTel(""); setNombre(""); setMsg("Sello sumado ✔"); cargar(); }
  }

  async function cargarSellos(id: string) {
    const { data } = await supabase.from("sellos").select("id,origen,anulado,created_at").eq("cliente_id", id).order("created_at", { ascending: false }).limit(15);
    setSellos((data ?? []) as Sello[]);
  }
  async function abrir(id: string) {
    if (abierto === id) { setAbierto(null); return; }
    setAbierto(id);
    await cargarSellos(id);
  }

  async function alternar(c: Cli, s: Sello) {
    await supabase.from("sellos").update({ anulado: !s.anulado }).eq("id", s.id);
    await cargar(); await cargarSellos(c.id);
  }

  async function canjear(c: Cli) {
    if (!confirm(`¿Entregar "${premio}" a ${c.nombre}? Se descuentan ${n} sellos.`)) return;
    const { error } = await supabase.rpc("canjear_premio", { p_cliente: c.id });
    setMsg(error ? "No alcanzan los sellos." : "Premio entregado ✔"); cargar();
  }

  return (
    <>
      <h2>Tu premio</h2>
      <div className="card">
        <label>Sellos para ganar<input type="number" min={2} max={100} value={n} onChange={(e) => setN(Number(e.target.value))} /></label>
        <label>Premio<input value={premio} onChange={(e) => setPremio(e.target.value)} maxLength={120} /></label>
        <button onClick={guardarConfig}>Guardar</button>
      </div>
      <h2>Sumar sello en el mostrador</h2>
      <input placeholder="WhatsApp del cliente" value={tel} onChange={(e) => setTel(e.target.value)} inputMode="tel" />
      <input placeholder="Nombre (si es nuevo)" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <button disabled={tel.replace(/\D/g, "").length < 8} onClick={sumarPorTelefono}>Sumar sello</button>
      {msg && <p role="status" className="mut">{msg}</p>}
      <h2>Clientes con sellos ({lista.length})</h2>
      {lista.length === 0 && <p className="mut">Los sellos llegan solos con cada pedido entregado, o los sumás acá.</p>}
      {lista.map((c) => (
        <div className="card" key={c.id}>
          <div className="row" onClick={() => abrir(c.id)} style={{ cursor: "pointer" }}>
            <b>{c.nombre}</b><b>{Math.min(c.sellos_disponibles, n)}/{n}{c.sellos_disponibles >= n ? " 🎁" : ""}</b>
          </div>
          <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap", marginTop: 8 }}>
            <button className="sec" onClick={async () => { if (await sumarSello(c.id)) cargar(); }}>+1 sello</button>
            {c.sellos_disponibles >= n && <button onClick={() => canjear(c)}>Entregar premio</button>}
            {c.sellos_disponibles >= n && (
              <a className="btn sec" href={linkWhatsApp(normalizarTelefonoAR(c.telefono), `Hola ${c.nombre}! Completaste tus sellos en ${kiosco.nombre}: ya tenés tu premio (${premio}). ¡Pasá a buscarlo!`)}>Avisar premio</a>
            )}
          </div>
          {abierto === c.id && (
            <ul style={{ margin: "10px 0 0", paddingLeft: 20 }} className="mut">
              {sellos.map((s) => (
                <li key={s.id} style={{ textDecoration: s.anulado ? "line-through" : undefined }}>
                  {new Date(s.created_at).toLocaleDateString("es-AR")} · {s.origen === "pedido" ? "pedido" : "mostrador"}{" "}
                  <a href="#" onClick={(e) => { e.preventDefault(); alternar(c, s); }}>{s.anulado ? "restaurar" : "anular"}</a>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </>
  );
}
