"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase, type Kiosco } from "@/lib/supabase";
import { peso } from "@/lib/whatsapp";

type Turno = { id: string; estado: "abierto" | "cerrado"; abierto_at: string; cerrado_at: string | null; monto_inicial: number; monto_final_declarado: number | null; monto_final_calculado: number | null; diferencia: number | null };
type Mov = { tipo: "sangria" | "refuerzo" | "retiro_final"; monto: number; concepto: string | null; created_at: string };
type Resumen = { turno_id: string; monto_inicial: number; ventas_efectivo: number; neto_movimientos: number; monto_calculado: number; movimientos: Mov[] };

const ETIQUETA_MOV: Record<Mov["tipo"], string> = { sangria: "Sangría (retiro)", refuerzo: "Refuerzo (ingreso)", retiro_final: "Retiro final" };
const ERRORES: [string, string][] = [
  ["turno_abierto", "Ya hay una caja abierta."],
  ["turno_cerrado", "Esa caja ya está cerrada."],
  ["monto_invalido", "Revisá el monto: tiene que ser un número válido."],
  ["tipo_invalido", "Tipo de movimiento inválido."],
  ["no_autorizado", "No tenés permiso para esta caja."],
];
const mensajeError = (m: string) => ERRORES.find(([k]) => m.includes(k))?.[1] ?? "No se pudo completar la operación.";
const num = (s: string) => Number(s.replace(",", "."));
const fecha = (iso: string) => new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });

export default function Caja({ kiosco }: { kiosco: Kiosco }) {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [fondo, setFondo] = useState("");
  const [tipo, setTipo] = useState<Mov["tipo"]>("sangria");
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [declarado, setDeclarado] = useState("");
  const [msg, setMsg] = useState("");
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from("turnos_caja").select("*").eq("kiosco_id", kiosco.id).order("abierto_at", { ascending: false }).limit(15);
    if (error) { setMsg("No pudimos cargar la caja."); return; }
    const lista = (data ?? []).map((t) => ({ ...t, monto_inicial: Number(t.monto_inicial), monto_final_declarado: t.monto_final_declarado == null ? null : Number(t.monto_final_declarado), monto_final_calculado: t.monto_final_calculado == null ? null : Number(t.monto_final_calculado), diferencia: t.diferencia == null ? null : Number(t.diferencia) })) as Turno[];
    setTurnos(lista);
    const abierto = lista.find((t) => t.estado === "abierto");
    if (abierto) {
      const { data: r, error: e2 } = await supabase.rpc("caja_resumen", { p_turno: abierto.id });
      if (e2) setMsg(mensajeError(e2.message ?? "")); else setResumen(r as Resumen);
    } else setResumen(null);
  }, [kiosco.id]);

  useEffect(() => { cargar(); }, [cargar]);

  const abierto = turnos.find((t) => t.estado === "abierto");

  async function abrir() {
    const m = num(fondo);
    if (isNaN(m) || m < 0) { setMsg("Poné el fondo inicial (puede ser 0)."); return; }
    setCargando(true); setMsg("");
    const { error } = await supabase.rpc("caja_abrir_turno", { p_kiosco: kiosco.id, p_monto_inicial: m });
    setCargando(false);
    if (error) { setMsg(mensajeError(error.message ?? "")); return; }
    setFondo(""); setMsg("Caja abierta ✔"); cargar();
  }

  async function registrar() {
    const m = num(monto);
    if (!abierto) return;
    if (!(m > 0)) { setMsg("Poné un monto mayor a cero."); return; }
    setCargando(true); setMsg("");
    const { error } = await supabase.rpc("caja_registrar_movimiento", { p_turno: abierto.id, p_tipo: tipo, p_monto: m, p_concepto: concepto.trim() || null });
    setCargando(false);
    if (error) { setMsg(mensajeError(error.message ?? "")); return; }
    setMonto(""); setConcepto(""); setMsg("Movimiento registrado ✔"); cargar();
  }

  async function cerrar() {
    if (!abierto) return;
    const d = num(declarado);
    if (isNaN(d) || d < 0) { setMsg("Poné el efectivo que contaste en la caja."); return; }
    if (!window.confirm("¿Cerrar la caja? Después no se pueden cargar más movimientos en este turno.")) return;
    setCargando(true); setMsg("");
    const { data, error } = await supabase.rpc("caja_cerrar_turno", { p_turno: abierto.id, p_monto_declarado: d });
    setCargando(false);
    if (error) { setMsg(mensajeError(error.message ?? "")); return; }
    const dif = Number((data as { diferencia: number }).diferencia);
    setDeclarado("");
    setMsg(dif === 0 ? "Caja cerrada. Cuadra exacto ✔" : `Caja cerrada. Diferencia: ${peso(dif)} ${dif < 0 ? "(faltante)" : "(sobrante)"}`);
    cargar();
  }

  return (
    <>
      {msg && <p role="status" className="mut">{msg}</p>}

      {!abierto && (
        <div className="card">
          <h2>Abrir caja</h2>
          <p className="mut">Contá el efectivo con el que arrancás el turno (fondo de caja).</p>
          <input placeholder="Fondo inicial" value={fondo} onChange={(e) => setFondo(e.target.value)} inputMode="decimal" />
          <button disabled={cargando || fondo === ""} onClick={abrir}>Abrir caja</button>
        </div>
      )}

      {abierto && resumen && (
        <>
          <div className="card" style={{ textAlign: "center" }}>
            <div className="mut">Efectivo esperado en caja</div>
            <b style={{ fontSize: 28 }}>{peso(resumen.monto_calculado)}</b>
            <div className="mut">Abierta desde {fecha(abierto.abierto_at)}</div>
          </div>
          <div className="card">
            <div className="row"><span className="mut">Fondo inicial</span><b>{peso(resumen.monto_inicial)}</b></div>
            <div className="row"><span className="mut">Ventas en efectivo</span><b>{peso(resumen.ventas_efectivo)}</b></div>
            <div className="row"><span className="mut">Movimientos (neto)</span><b>{peso(resumen.neto_movimientos)}</b></div>
          </div>

          <div className="card">
            <h2>Movimiento de caja</h2>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as Mov["tipo"])}>
              {(Object.keys(ETIQUETA_MOV) as Mov["tipo"][]).map((k) => <option key={k} value={k}>{ETIQUETA_MOV[k]}</option>)}
            </select>
            <input placeholder="Monto" value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" />
            <input placeholder="Concepto (ej: compra de hielo)" value={concepto} onChange={(e) => setConcepto(e.target.value)} />
            <button disabled={cargando} onClick={registrar}>Registrar</button>
            {resumen.movimientos.length > 0 && (
              <ul className="mut" style={{ margin: "10px 0 0", paddingLeft: 20 }}>
                {resumen.movimientos.map((m, i) => (
                  <li key={i}>{fecha(m.created_at)} · {ETIQUETA_MOV[m.tipo]} {peso(Number(m.monto))}{m.concepto ? ` · ${m.concepto}` : ""}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h2>Cerrar caja</h2>
            <p className="mut">Contá el efectivo y anotalo. Te mostramos la diferencia contra lo esperado.</p>
            <input placeholder="Efectivo contado" value={declarado} onChange={(e) => setDeclarado(e.target.value)} inputMode="decimal" />
            <button className="sec" disabled={cargando} onClick={cerrar}>Cerrar caja</button>
          </div>
        </>
      )}

      <h2>Turnos anteriores</h2>
      {turnos.filter((t) => t.estado === "cerrado").length === 0 && <p className="mut">Todavía no cerraste ninguna caja.</p>}
      {turnos.filter((t) => t.estado === "cerrado").map((t) => (
        <div className="card" key={t.id}>
          <div className="row"><span>{fecha(t.abierto_at)} → {t.cerrado_at ? fecha(t.cerrado_at) : ""}</span></div>
          <div className="mut">Fondo {peso(t.monto_inicial)} · Esperado {peso(t.monto_final_calculado ?? 0)} · Contado {peso(t.monto_final_declarado ?? 0)}</div>
          <b style={{ color: (t.diferencia ?? 0) === 0 ? undefined : "#c0392b" }}>{(t.diferencia ?? 0) === 0 ? "Cuadra" : `Diferencia ${peso(t.diferencia ?? 0)}`}</b>
        </div>
      ))}
    </>
  );
}
