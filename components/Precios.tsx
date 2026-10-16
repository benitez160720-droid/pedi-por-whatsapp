"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase, type Kiosco } from "@/lib/supabase";
import { peso } from "@/lib/whatsapp";

type Prev = { producto_id: string; nombre: string; categoria: string; precio_anterior: number; precio_nuevo: number };
type Ajuste = { id: string; porcentaje: number; categoria: string | null; cantidad: number; created_at: string; revertido_at: string | null };

export default function Precios({ kiosco }: { kiosco: Kiosco }) {
  const [pct, setPct] = useState("");
  const [cat, setCat] = useState("");
  const [red, setRed] = useState(10);
  const [cats, setCats] = useState<string[]>([]);
  const [prev, setPrev] = useState<Prev[] | null>(null);
  const [hist, setHist] = useState<Ajuste[]>([]);
  const [msg, setMsg] = useState(""); const [ocupado, setOcupado] = useState(false);
  const pctNum = Number(pct.replace(",", "."));
  const pctOk = pct !== "" && pctNum !== 0 && pctNum >= -50 && pctNum <= 200;

  const cargar = useCallback(async () => {
    const [c, h] = await Promise.all([
      supabase.from("productos").select("categoria").eq("kiosco_id", kiosco.id),
      supabase.from("ajustes_precios").select("id,porcentaje,categoria,cantidad,created_at,revertido_at").eq("kiosco_id", kiosco.id).order("created_at", { ascending: false }).limit(10),
    ]);
    setCats([...new Set((c.data ?? []).map((x) => x.categoria as string))].sort());
    setHist((h.data ?? []).map((a) => ({ ...a, porcentaje: Number(a.porcentaje) })) as Ajuste[]);
  }, [kiosco.id]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { setPrev(null); }, [pct, cat, red]);

  const args = { p_kiosco: kiosco.id, p_pct: pctNum, p_categoria: cat || null, p_redondeo: red };

  async function previsualizar() {
    setMsg(""); setOcupado(true);
    const { data, error } = await supabase.rpc("previsualizar_ajuste", args);
    setOcupado(false);
    if (error) { setMsg("No se pudo calcular la vista previa."); return; }
    const rows = (data ?? []).map((r: Prev) => ({ ...r, precio_anterior: Number(r.precio_anterior), precio_nuevo: Number(r.precio_nuevo) }));
    setPrev(rows); if (rows.length === 0) setMsg("Con esos datos ningún precio cambia.");
  }

  async function aplicar() {
    if (!prev || !confirm(`¿Cambiar el precio de ${prev.length} productos (${pctNum > 0 ? "+" : ""}${pctNum}%)?`)) return;
    setOcupado(true);
    const { data, error } = await supabase.rpc("ajustar_precios", args);
    setOcupado(false);
    if (error) { setMsg("No se pudo aplicar el ajuste."); return; }
    setMsg(`Listo: ${data.cantidad} precios actualizados ✔`); setPct(""); setPrev(null); cargar();
  }

  async function deshacer(a: Ajuste) {
    if (!confirm(`¿Deshacer el ajuste del ${new Date(a.created_at).toLocaleDateString("es-AR")}?`)) return;
    const { data, error } = await supabase.rpc("revertir_ajuste", { p_ajuste: a.id });
    if (error) { setMsg("No se pudo deshacer."); return; }
    setMsg(`Se restauraron ${data.revertidos} precios${data.omitidos ? ` (${data.omitidos} se dejaron porque los cambiaste a mano después)` : ""}.`); cargar();
  }

  return (
    <>
      <h2>Subir o bajar precios</h2>
      <label>Porcentaje (ej. 10 sube 10%, -5 baja 5%)<input value={pct} onChange={(e) => setPct(e.target.value)} inputMode="decimal" placeholder="10" /></label>
      <label>¿A qué productos?
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Todo el catálogo</option>
          {cats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label>Redondear a
        <select value={red} onChange={(e) => setRed(Number(e.target.value))}>
          <option value={0}>Sin redondeo</option><option value={10}>$10</option><option value={50}>$50</option><option value={100}>$100</option>
        </select>
      </label>
      {pct !== "" && !pctOk && <p role="alert" style={{ color: "#c0392b" }}>El porcentaje tiene que estar entre -50 y 200, y no puede ser 0.</p>}
      <button disabled={!pctOk || ocupado} onClick={previsualizar}>Ver vista previa</button>
      {msg && <p role="status" className="mut">{msg}</p>}
      {prev && prev.length > 0 && (
        <>
          <h2>{prev.length} productos van a cambiar</h2>
          {prev.slice(0, 12).map((p) => (
            <div className="row" key={p.producto_id}><span>{p.nombre}</span><span><s className="mut">{peso(p.precio_anterior)}</s> → <b>{peso(p.precio_nuevo)}</b></span></div>
          ))}
          {prev.length > 12 && <p className="mut">…y {prev.length - 12} más.</p>}
          <button disabled={ocupado} onClick={aplicar} style={{ marginTop: 12 }}>Aplicar cambios</button>
        </>
      )}
      <h2>Historial</h2>
      {hist.length === 0 && <p className="mut">Todavía no hiciste ajustes.</p>}
      {hist.map((a) => (
        <div className="card row" key={a.id}>
          <div>
            <b>{a.porcentaje > 0 ? "+" : ""}{a.porcentaje}%</b> · {a.categoria ?? "todo"} · {a.cantidad} productos
            <div className="mut">{new Date(a.created_at).toLocaleDateString("es-AR")}{a.revertido_at ? " · deshecho" : ""}</div>
          </div>
          {!a.revertido_at && <button className="sec" onClick={() => deshacer(a)}>Deshacer</button>}
        </div>
      ))}
    </>
  );
}
