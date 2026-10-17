"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, type Kiosco } from "@/lib/supabase";
import { ETIQUETA_PAGO, peso } from "@/lib/whatsapp";

type Medio = "efectivo" | "transferencia" | "mercadopago";
type Turno = { id: string; estado: "abierto" | "cerrado"; abierto_at: string; cerrado_at: string | null; monto_inicial: number; monto_final_declarado: number | null; monto_final_calculado: number | null; diferencia: number | null };
type Mov = { tipo: "sangria" | "refuerzo" | "retiro_final"; monto: number; concepto: string | null; created_at: string };
type PagoVenta = { medio: Medio; monto: number };
type Venta = { id: string; numero: number; total: number; vuelto: number; anulada: boolean; created_at: string; pagos: PagoVenta[]; items: { nombre: string; cantidad: number; precio_unit: number }[] };
type Resumen = { turno_id: string; monto_inicial: number; ventas_efectivo: number; neto_movimientos: number; monto_calculado: number; movimientos: Mov[]; ventas_por_medio: Record<Medio, number>; ventas: Venta[] };
type Producto = { id: string; nombre: string; categoria: string; precio: number; stock: number; stock_controlado: boolean };
type FilaPago = { medio: Medio; monto: string };

const MEDIOS: Medio[] = ["efectivo", "transferencia", "mercadopago"];
const ETIQUETA_MOV: Record<Mov["tipo"], string> = { sangria: "Sangría (retiro)", refuerzo: "Refuerzo (ingreso)", retiro_final: "Retiro final" };
const ERRORES: [string, string][] = [
  ["turno_abierto", "Ya hay una caja abierta."],
  ["turno_cerrado", "La caja está cerrada."],
  ["monto_invalido", "Revisá el monto: tiene que ser un número válido."],
  ["tipo_invalido", "Tipo de movimiento inválido."],
  ["no_autorizado", "No tenés permiso para esta caja."],
  ["sin_stock", "Alguno de los productos no tiene stock suficiente."],
  ["pago_insuficiente", "El pago no alcanza para cubrir el total."],
  ["pago_excede_total", "Lo que no es efectivo no puede pasar el total. El vuelto sale solo de efectivo."],
  ["medio_pago_invalido", "Ese medio de pago no está disponible."],
  ["producto_no_encontrado", "Un producto del carrito ya no existe. Actualizá la página."],
  ["cantidad_invalida", "Revisá las cantidades del carrito."],
  ["ya_anulada", "Esa venta ya estaba anulada."],
];
const mensajeError = (m: string) => ERRORES.find(([k]) => m.includes(k))?.[1] ?? "No se pudo completar la operación.";
const num = (s: string) => Number(s.replace(",", "."));
const fecha = (iso: string) => new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const redondear = (n: number) => Math.round(n * 100) / 100;

export default function Caja({ kiosco }: { kiosco: Kiosco }) {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [msg, setMsg] = useState("");
  const [cargando, setCargando] = useState(false);

  // Apertura, movimientos y cierre
  const [fondo, setFondo] = useState("");
  const [tipo, setTipo] = useState<Mov["tipo"]>("sangria");
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [declarado, setDeclarado] = useState("");

  // Mostrador
  const [busqueda, setBusqueda] = useState("");
  const [carrito, setCarrito] = useState<Record<string, number>>({});
  const [pagos, setPagos] = useState<FilaPago[]>([{ medio: "efectivo", monto: "" }]);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from("turnos_caja").select("*").eq("kiosco_id", kiosco.id).order("abierto_at", { ascending: false }).limit(15);
    if (error) { setMsg("No pudimos cargar la caja."); return; }
    const lista = (data ?? []).map((t) => ({ ...t, monto_inicial: Number(t.monto_inicial), monto_final_declarado: t.monto_final_declarado == null ? null : Number(t.monto_final_declarado), monto_final_calculado: t.monto_final_calculado == null ? null : Number(t.monto_final_calculado), diferencia: t.diferencia == null ? null : Number(t.diferencia) })) as Turno[];
    setTurnos(lista);
    const abierto = lista.find((t) => t.estado === "abierto");
    if (abierto) {
      const { data: r, error: e2 } = await supabase.rpc("caja_resumen", { p_turno: abierto.id });
      if (e2) setMsg(mensajeError(e2.message ?? "")); else setResumen(r as Resumen);
      const { data: p } = await supabase.from("productos").select("id,nombre,categoria,precio,stock,stock_controlado").eq("kiosco_id", kiosco.id).order("categoria").order("nombre");
      setProductos((p ?? []).map((x) => ({ ...x, precio: Number(x.precio), stock: Number(x.stock ?? 0) })) as Producto[]);
    } else {
      setResumen(null);
      setCarrito({});
    }
  }, [kiosco.id]);

  useEffect(() => { cargar(); }, [cargar]);

  const abierto = turnos.find((t) => t.estado === "abierto");

  // Carrito y pagos derivados
  const items = useMemo(() => productos.filter((p) => carrito[p.id]).map((p) => ({ p, cant: carrito[p.id] })), [carrito, productos]);
  const total = useMemo(() => redondear(items.reduce((s, i) => s + i.p.precio * i.cant, 0)), [items]);
  const pagado = useMemo(() => redondear(pagos.reduce((s, f) => s + (num(f.monto) || 0), 0)), [pagos]);
  const noEfectivo = useMemo(() => redondear(pagos.filter((f) => f.medio !== "efectivo").reduce((s, f) => s + (num(f.monto) || 0), 0)), [pagos]);
  const vuelto = Math.max(0, redondear(pagado - total));
  const faltante = Math.max(0, redondear(total - pagado));
  const pagosValidos = pagos.every((f) => num(f.monto) > 0);
  const puedeCobrar = items.length > 0 && total > 0 && pagosValidos && faltante === 0 && noEfectivo <= total && !cargando;

  const filtrados = useMemo(() => {
    const q = norm(busqueda.trim());
    return productos.filter((p) => !q || norm(p.nombre).includes(q));
  }, [productos, busqueda]);

  function sumar(p: Producto, d: number) {
    setCarrito((c) => {
      const actual = c[p.id] ?? 0;
      const tope = p.stock_controlado ? Math.min(99, p.stock) : 99;
      const n = Math.min(tope, Math.max(0, actual + d));
      const x = { ...c };
      if (n) x[p.id] = n; else delete x[p.id];
      return x;
    });
  }

  function pagoExacto() {
    setPagos([{ medio: "efectivo", monto: String(total) }]);
  }

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

  async function cobrar() {
    if (!abierto || !puedeCobrar) return;
    setCargando(true); setMsg("");
    const { data, error } = await supabase.rpc("registrar_venta_mostrador", {
      p_turno: abierto.id,
      p_items: items.map((i) => ({ producto_id: i.p.id, cantidad: i.cant })),
      p_pagos: pagos.map((f) => ({ medio: f.medio, monto: num(f.monto) })),
    });
    setCargando(false);
    if (error) { setMsg(mensajeError(error.message ?? "")); cargar(); return; }
    const r = data as { numero: number; vuelto: number };
    setCarrito({});
    setPagos([{ medio: "efectivo", monto: "" }]);
    setMsg(`Venta #${r.numero} cobrada ✔${r.vuelto > 0 ? ` · Vuelto ${peso(Number(r.vuelto))}` : ""}`);
    cargar();
  }

  async function anular(v: Venta) {
    if (!window.confirm(`¿Anular la venta #${v.numero}? Se devuelve el stock y sale de la caja.`)) return;
    setCargando(true); setMsg("");
    const { error } = await supabase.rpc("anular_venta_mostrador", { p_venta: v.id });
    setCargando(false);
    if (error) { setMsg(mensajeError(error.message ?? "")); return; }
    setMsg(`Venta #${v.numero} anulada ✔`); cargar();
  }

  async function cerrar() {
    if (!abierto) return;
    const d = num(declarado);
    if (isNaN(d) || d < 0) { setMsg("Poné el efectivo que contaste en la caja."); return; }
    if (!window.confirm("¿Cerrar la caja? Después no se pueden cargar ventas ni movimientos en este turno.")) return;
    setCargando(true); setMsg("");
    const { data, error } = await supabase.rpc("caja_cerrar_turno", { p_turno: abierto.id, p_monto_declarado: d });
    setCargando(false);
    if (error) { setMsg(mensajeError(error.message ?? "")); return; }
    const dif = Number((data as { diferencia: number }).diferencia);
    setDeclarado("");
    setMsg(dif === 0 ? "Caja cerrada. Cuadra exacto ✔" : `Caja cerrada. Diferencia: ${peso(dif)} ${dif < 0 ? "(faltante)" : "(sobrante)"}`);
    cargar();
  }

  const ventasActivas = resumen?.ventas.filter((v) => !v.anulada) ?? [];

  return (
    <>
      {msg && <p role="status" className="alerta">{msg}</p>}

      {!abierto && (
        <div className="card">
          <h2>Abrir caja</h2>
          <p className="mut">Contá el efectivo con el que arrancás el turno (fondo de caja).</p>
          <label>Fondo inicial<input placeholder="0" value={fondo} onChange={(e) => setFondo(e.target.value)} inputMode="decimal" /></label>
          <button className="ancho" disabled={cargando || fondo === ""} onClick={abrir}>Abrir caja</button>
        </div>
      )}

      {abierto && resumen && (
        <>
          <div className="card">
            <div className="row"><span className="mut">Caja abierta desde {fecha(abierto.abierto_at)}</span><span className="tag">Abierta</span></div>
            <div className="recibo">
              <div className="row"><span>Fondo inicial</span><b>{peso(resumen.monto_inicial)}</b></div>
              <div className="row"><span>Efectivo de ventas (neto de vuelto)</span><b>{peso(resumen.ventas_efectivo)}</b></div>
              <div className="row"><span>Transferencias</span><b>{peso(resumen.ventas_por_medio.transferencia ?? 0)}</b></div>
              <div className="row"><span>Mercado Pago</span><b>{peso(resumen.ventas_por_medio.mercadopago ?? 0)}</b></div>
              <div className="row"><span>Movimientos (neto)</span><b>{peso(resumen.neto_movimientos)}</b></div>
            </div>
            <div className="total"><span>Efectivo esperado</span><b>{peso(resumen.monto_calculado)}</b></div>
          </div>

          <h2>Mostrador</h2>
          <input type="search" placeholder="Buscar producto" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar producto para vender" />
          {productos.length === 0 && <p className="mut">Todavía no cargaste productos.</p>}
          <div className="grid-productos">
            {filtrados.map((p) => {
              const sinStock = p.stock_controlado && p.stock <= 0;
              return (
                <div className="producto" key={p.id}>
                  <article className="card-producto">
                    <div className="producto-nombre">{p.nombre}</div>
                    <div className="mut">{p.stock_controlado ? (sinStock ? "Sin stock" : `Stock: ${p.stock}`) : p.categoria}</div>
                    <div className="producto-pie">
                      <span className="producto-precio">{peso(p.precio)}</span>
                      <button className="sec" disabled={sinStock || (carrito[p.id] ?? 0) >= (p.stock_controlado ? p.stock : 99)} onClick={() => sumar(p, 1)} aria-label={`Agregar ${p.nombre}`}>+</button>
                    </div>
                  </article>
                </div>
              );
            })}
          </div>

          {items.length > 0 && (
            <div className="card">
              <h3>Venta en curso</h3>
              <div className="recibo">
                {items.map(({ p, cant }) => (
                  <div className="row" key={p.id}>
                    <span className="linea-nombre">{p.nombre}<br /><span className="mut">{peso(p.precio)} c/u</span></span>
                    <div className="qty">
                      <button className="sec" onClick={() => sumar(p, -1)} aria-label={`Quitar uno de ${p.nombre}`}>−</button>
                      <span>{cant}</span>
                      <button onClick={() => sumar(p, 1)} aria-label={`Agregar uno de ${p.nombre}`}>+</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="total"><span>Total</span><b>{peso(total)}</b></div>

              <h3>Cómo cobra</h3>
              {pagos.map((f, i) => (
                <div className="row" key={i}>
                  <select value={f.medio} onChange={(e) => setPagos((ps) => ps.map((x, j) => j === i ? { ...x, medio: e.target.value as Medio } : x))} aria-label="Medio de pago">
                    {MEDIOS.map((m) => <option key={m} value={m}>{ETIQUETA_PAGO[m] ?? m}</option>)}
                  </select>
                  <input placeholder="Monto" inputMode="decimal" value={f.monto} onChange={(e) => setPagos((ps) => ps.map((x, j) => j === i ? { ...x, monto: e.target.value } : x))} aria-label="Monto del pago" />
                  {pagos.length > 1 && <button className="sec" onClick={() => setPagos((ps) => ps.filter((_, j) => j !== i))} aria-label="Quitar este pago">×</button>}
                </div>
              ))}
              <div className="row">
                <button className="sec" onClick={pagoExacto}>Todo en efectivo</button>
                <button className="sec" onClick={() => setPagos((ps) => [...ps, { medio: "transferencia", monto: "" }])}>+ Otro medio</button>
              </div>
              {faltante > 0 && <p className="mut">Faltan {peso(faltante)}.</p>}
              {vuelto > 0 && <p className="ok">Vuelto: {peso(vuelto)}</p>}
              {noEfectivo > total && <p className="alerta">Lo que no es efectivo no puede superar el total.</p>}
              <button className="ancho" disabled={!puedeCobrar} onClick={cobrar}>{cargando ? "Cobrando…" : `Cobrar ${peso(total)}`}</button>
            </div>
          )}

          <h2>Ventas del turno</h2>
          {resumen.ventas.length === 0 && <p className="mut">Todavía no hiciste ventas en este turno.</p>}
          {resumen.ventas.map((v) => (
            <div className="card" key={v.id} style={v.anulada ? { opacity: 0.6 } : undefined}>
              <div className="row">
                <span><b>Venta #{v.numero}</b> · {fecha(v.created_at)}</span>
                {v.anulada ? <span className="tag">Anulada</span> : <b>{peso(v.total)}</b>}
              </div>
              <div className="mut">{v.items.map((i) => `${i.cantidad} × ${i.nombre}`).join(" · ")}</div>
              <div className="row">
                <span>{v.pagos.map((p) => <span key={p.medio} className="tag" style={{ marginRight: 6 }}>{ETIQUETA_PAGO[p.medio] ?? p.medio} {peso(p.monto)}</span>)}</span>
                {!v.anulada && <button className="sec" disabled={cargando} onClick={() => anular(v)}>Anular</button>}
              </div>
              {v.vuelto > 0 && <div className="mut">Vuelto {peso(v.vuelto)}</div>}
            </div>
          ))}
          {ventasActivas.length > 0 && <p className="mut">{ventasActivas.length} venta(s) activa(s).</p>}

          <h2>Movimiento de caja</h2>
          <div className="card">
            <label>Tipo<select value={tipo} onChange={(e) => setTipo(e.target.value as Mov["tipo"])}>
              {(Object.keys(ETIQUETA_MOV) as Mov["tipo"][]).map((k) => <option key={k} value={k}>{ETIQUETA_MOV[k]}</option>)}
            </select></label>
            <label>Monto<input placeholder="0" value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" /></label>
            <label>Concepto<input placeholder="Ej: compra de hielo" value={concepto} onChange={(e) => setConcepto(e.target.value)} /></label>
            <button className="sec" disabled={cargando} onClick={registrar}>Registrar</button>
            {resumen.movimientos.length > 0 && (
              <div className="recibo" style={{ marginTop: 12 }}>
                {resumen.movimientos.map((m, i) => (
                  <div className="row" key={i}><span className="mut">{fecha(m.created_at)} · {ETIQUETA_MOV[m.tipo]}{m.concepto ? ` · ${m.concepto}` : ""}</span><b>{peso(Number(m.monto))}</b></div>
                ))}
              </div>
            )}
          </div>

          <h2>Cerrar caja</h2>
          <div className="card">
            <p className="mut">Contá el efectivo y anotalo. Te mostramos la diferencia contra lo esperado.</p>
            <label>Efectivo contado<input placeholder="0" value={declarado} onChange={(e) => setDeclarado(e.target.value)} inputMode="decimal" /></label>
            <button className="sec ancho" disabled={cargando} onClick={cerrar}>Cerrar caja</button>
          </div>
        </>
      )}

      <h2>Turnos anteriores</h2>
      {turnos.filter((t) => t.estado === "cerrado").length === 0 && <p className="mut">Todavía no cerraste ninguna caja.</p>}
      {turnos.filter((t) => t.estado === "cerrado").map((t) => (
        <div className="card" key={t.id}>
          <div className="row"><span>{fecha(t.abierto_at)} → {t.cerrado_at ? fecha(t.cerrado_at) : ""}</span></div>
          <div className="mut">Fondo {peso(t.monto_inicial)} · Esperado {peso(t.monto_final_calculado ?? 0)} · Contado {peso(t.monto_final_declarado ?? 0)}</div>
          <b className={(t.diferencia ?? 0) === 0 ? "ok" : undefined}>{(t.diferencia ?? 0) === 0 ? "Cuadra" : `Diferencia ${peso(t.diferencia ?? 0)}`}</b>
        </div>
      ))}
    </>
  );
}
