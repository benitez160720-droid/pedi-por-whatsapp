"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, type Kiosco, type Producto } from "@/lib/supabase";
import { peso } from "@/lib/whatsapp";
import type { Seleccion } from "@/lib/etiquetas";
import { cantidadDesdeTexto, cantidadTexto, mensajeCompras, totalCompra, totalLinea, type LineaCompra, type MovStock, type Proveedor } from "@/lib/compras";

type Compra = { id: string; numero: number; total: number; pagado: number; comprobante: string | null; anulada: boolean; created_at: string };
type Pago = { id: string; tipo: "compra" | "pago"; monto: number; medio: string | null; nota: string | null; created_at: string };
const num = (s: string) => Number(String(s).replace(",", "."));
const MEDIOS: [string, string][] = [["efectivo", "Efectivo"], ["transferencia", "Transferencia"], ["mercadopago", "Mercado Pago"], ["tarjeta", "Tarjeta"], ["otro", "Otro"]];
const fecha = (s: string) => new Date(s).toLocaleDateString("es-AR");
const FORM_VACIO = { nombre: "", telefono: "", cuit: "", notas: "" };

export default function Proveedores({ kiosco, onEtiquetas }: { kiosco: Kiosco; onEtiquetas?: (sel: Seleccion[]) => void }) {
  const [ultima, setUltima] = useState<Seleccion[]>([]);
  const [vista, setVista] = useState<"proveedores" | "stock">("proveedores");
  const [lista, setLista] = useState<Proveedor[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [compras, setCompras] = useState<Compra[]>([]);
  const [movs, setMovs] = useState<Pago[]>([]);
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [form, setForm] = useState<(typeof FORM_VACIO & { id?: string }) | null>(null);
  const [pagoMonto, setPagoMonto] = useState(""); const [pagoMedio, setPagoMedio] = useState("efectivo");
  // Compra en armado
  const [comprando, setComprando] = useState<string | null>(null);
  const [lineas, setLineas] = useState<LineaCompra[]>([]);
  const [selProd, setSelProd] = useState(""); const [cantTxt, setCantTxt] = useState(""); const [costoTxt, setCostoTxt] = useState("");
  const [pagaAhora, setPagaAhora] = useState(""); const [medioCompra, setMedioCompra] = useState("efectivo"); const [comprobante, setComprobante] = useState("");
  // Historial y ajuste de stock
  const [hist, setHist] = useState<MovStock[]>([]);
  const [ajProd, setAjProd] = useState(""); const [ajNuevo, setAjNuevo] = useState(""); const [ajMotivo, setAjMotivo] = useState("");

  const cargar = useCallback(async () => {
    const [p, pr] = await Promise.all([
      supabase.from("proveedores_saldo").select("*").eq("kiosco_id", kiosco.id).order("saldo", { ascending: false }).order("nombre"),
      supabase.from("productos").select("id,kiosco_id,nombre,categoria,precio,disponible,stock_controlado,stock,vendido_por_peso,barcode").eq("kiosco_id", kiosco.id).order("nombre"),
    ]);
    if (p.error) setMsg("No pudimos cargar los proveedores."); else setLista((p.data ?? []).map((x) => ({ ...x, saldo: Number(x.saldo) })) as Proveedor[]);
    setProductos((pr.data ?? []) as Producto[]);
  }, [kiosco.id]);
  useEffect(() => { void cargar(); }, [cargar]);

  const cargarHistorial = useCallback(async () => {
    const { data } = await supabase.from("stock_movimientos").select("id,tipo,cantidad,stock_resultante,motivo,created_at,productos(nombre,vendido_por_peso)")
      .eq("kiosco_id", kiosco.id).order("created_at", { ascending: false }).limit(40);
    setHist((data ?? []) as unknown as MovStock[]);
  }, [kiosco.id]);
  useEffect(() => { if (vista === "stock") void cargarHistorial(); }, [vista, cargarHistorial]);

  async function detalle(id: string) {
    const [c, m] = await Promise.all([
      supabase.from("compras").select("id,numero,total,pagado,comprobante,anulada,created_at").eq("proveedor_id", id).order("created_at", { ascending: false }).limit(10),
      supabase.from("proveedor_movimientos").select("id,tipo,monto,medio,nota,created_at").eq("proveedor_id", id).order("created_at", { ascending: false }).limit(12),
    ]);
    setCompras(((c.data ?? []) as Compra[]).map((x) => ({ ...x, total: Number(x.total), pagado: Number(x.pagado) })));
    setMovs(((m.data ?? []) as Pago[]).map((x) => ({ ...x, monto: Number(x.monto) })));
  }
  async function abrir(id: string) {
    setMsg(""); setPagoMonto(""); setComprando(null);
    if (abierto === id) { setAbierto(null); return; }
    setAbierto(id); await detalle(id);
  }
  const refrescar = async (id?: string) => { await cargar(); if (id) await detalle(id); };

  async function guardarProveedor() {
    if (!form) return;
    setOcupado(true); setMsg("");
    const { error } = await supabase.rpc("proveedor_guardar", { p_kiosco: kiosco.id, p_id: form.id ?? null, p_nombre: form.nombre, p_telefono: form.telefono, p_cuit: form.cuit, p_notas: form.notas, p_activo: true });
    setOcupado(false);
    if (error) return setMsg(mensajeCompras(error.message));
    setForm(null); setMsg("Proveedor guardado ✔"); await cargar();
  }
  async function pagar(p: Proveedor) {
    const m = num(pagoMonto);
    if (!(m > 0)) return setMsg("Poné un monto mayor a cero.");
    setOcupado(true);
    const { error } = await supabase.rpc("pagar_proveedor", { p_kiosco: kiosco.id, p_proveedor: p.id, p_monto: m, p_medio: pagoMedio, p_nota: null });
    setOcupado(false);
    if (error) return setMsg(mensajeCompras(error.message));
    setPagoMonto(""); setMsg("Pago registrado ✔"); await refrescar(p.id);
  }

  const prodSel = productos.find((p) => p.id === selProd);
  function agregarLinea() {
    if (!prodSel) return setMsg("Elegí un producto.");
    const cant = cantidadDesdeTexto(cantTxt, !!prodSel.vendido_por_peso);
    if (cant === null) return setMsg(prodSel.vendido_por_peso ? "La cantidad en kg tiene que ser mayor a cero (hasta 3 decimales)." : "La cantidad tiene que ser un número entero mayor a cero.");
    const costo = num(costoTxt);
    if (!(costo >= 0) || costoTxt.trim() === "") return setMsg("Poné el costo.");
    setMsg("");
    setLineas((ls) => [...ls.filter((l) => l.producto_id !== prodSel.id), { producto_id: prodSel.id, nombre: prodSel.nombre, por_peso: !!prodSel.vendido_por_peso, cantidad: cant, costo }]);
    setSelProd(""); setCantTxt(""); setCostoTxt("");
  }
  const total = useMemo(() => totalCompra(lineas), [lineas]);
  function empezarCompra(id: string) { setComprando(id); setLineas([]); setPagaAhora(""); setComprobante(""); setMedioCompra("efectivo"); setMsg(""); }

  async function guardarCompra(p: Proveedor) {
    if (lineas.length === 0) return setMsg("Agregá al menos un producto.");
    const pag = pagaAhora.trim() === "" ? 0 : num(pagaAhora);
    if (!(pag >= 0) || pag > total) return setMsg("Lo que pagás ahora no puede superar el total.");
    setOcupado(true); setMsg("");
    const { data, error } = await supabase.rpc("registrar_compra", {
      p_kiosco: kiosco.id, p_proveedor: p.id, p_items: lineas.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad, costo: l.costo })),
      p_pagado: pag, p_medio: medioCompra, p_comprobante: comprobante || null, p_nota: null,
    });
    setOcupado(false);
    if (error) return setMsg(mensajeCompras(error.message));
    // Una etiqueta por unidad comprada (por peso: una sola, el precio es por kg).
    setUltima(lineas.map((l) => ({ producto_id: l.producto_id, copias: l.por_peso ? 1 : Math.min(l.cantidad, 999) })));
    setComprando(null); setLineas([]);
    setMsg(`Compra #${data?.numero ?? ""} registrada ✔ Stock actualizado.`); await refrescar(p.id);
  }
  async function anular(p: Proveedor, c: Compra) {
    if (!window.confirm(`¿Anular la compra #${c.numero}? Se resta el stock que sumó y se borra su deuda.`)) return;
    const { error } = await supabase.rpc("anular_compra", { p_compra: c.id });
    if (error) return setMsg(mensajeCompras(error.message));
    setMsg("Compra anulada ✔"); await refrescar(p.id);
  }

  async function ajustar() {
    const pr = productos.find((p) => p.id === ajProd);
    if (!pr) return setMsg("Elegí un producto.");
    const n = cantidadDesdeTexto(ajNuevo === "0" ? "1" : ajNuevo, !!pr.vendido_por_peso);
    const nuevo = ajNuevo.trim() === "0" ? 0 : n;
    if (nuevo === null) return setMsg(pr.vendido_por_peso ? "El stock nuevo va en kg (ej. 2,5)." : "El stock nuevo tiene que ser un número entero.");
    setOcupado(true); setMsg("");
    const { error } = await supabase.rpc("ajustar_stock", { p_producto: pr.id, p_nuevo: nuevo, p_motivo: ajMotivo });
    setOcupado(false);
    if (error) return setMsg(mensajeCompras(error.message));
    setAjProd(""); setAjNuevo(""); setAjMotivo(""); setMsg("Stock ajustado ✔"); await Promise.all([cargar(), cargarHistorial()]);
  }

  const deuda = lista.filter((p) => p.saldo > 0).reduce((s, p) => s + p.saldo, 0);
  const controlados = productos.filter((p) => p.stock_controlado);
  return (
    <>
      <div className="row" style={{ justifyContent: "flex-start", gap: 8, flexWrap: "wrap" }}>
        <button className={vista === "proveedores" ? "" : "sec"} onClick={() => setVista("proveedores")}>Proveedores</button>
        <button className={vista === "stock" ? "" : "sec"} onClick={() => setVista("stock")}>Movimientos de stock</button>
      </div>
      {msg && <p role="status" className="mut">{msg}</p>}
      {onEtiquetas && ultima.length > 0 && <button className="sec" onClick={() => onEtiquetas(ultima)}>Imprimir etiquetas de esa compra</button>}

      {vista === "proveedores" && (
        <>
          <div className="card" style={{ textAlign: "center" }}>
            <div className="mut">Les debés a tus proveedores</div>
            <b style={{ fontSize: 28 }}>{peso(deuda)}</b>
            <div className="mut">{lista.filter((p) => p.saldo > 0).length} proveedores con saldo</div>
          </div>
          {lista.length === 0 && !form && <p className="mut">Todavía no cargaste proveedores.</p>}
          {lista.map((p) => (
            <div className="card" key={p.id}>
              <div className="row" onClick={() => abrir(p.id)} style={{ cursor: "pointer" }}>
                <b>{p.nombre}</b><b style={{ color: p.saldo > 0 ? "#c0392b" : undefined }}>{peso(p.saldo)}</b>
              </div>
              {abierto === p.id && (
                <>
                  <p className="mut" style={{ margin: ".3rem 0" }}>{[p.telefono, p.cuit && `CUIT ${p.cuit}`, p.notas].filter(Boolean).join(" · ") || "Sin datos de contacto."}</p>
                  <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap", gap: 8 }}>
                    <button onClick={() => empezarCompra(p.id)}>Cargar compra</button>
                    <button className="sec" onClick={() => setForm({ id: p.id, nombre: p.nombre, telefono: p.telefono ?? "", cuit: p.cuit ?? "", notas: p.notas ?? "" })}>Editar</button>
                  </div>

                  {comprando === p.id && (
                    <div className="card" style={{ margin: ".6rem 0" }}>
                      <h3 style={{ marginTop: 0 }}>Nueva compra</h3>
                      <select value={selProd} onChange={(e) => setSelProd(e.target.value)}>
                        <option value="">Elegí un producto…</option>
                        {productos.map((x) => <option key={x.id} value={x.id}>{x.nombre}{x.stock_controlado ? ` (hay ${cantidadTexto(x.stock ?? 0, !!x.vendido_por_peso)})` : ""}</option>)}
                      </select>
                      {prodSel && !prodSel.stock_controlado && <p className="mut" style={{ margin: ".2rem 0" }}>Este producto no controla stock: se guarda el costo pero no suma cantidad.</p>}
                      <div className="pos-filtros" style={{ gridTemplateColumns: "1fr 1fr" }}>
                        <label>{prodSel?.vendido_por_peso ? "Cantidad (kg)" : "Cantidad"}<input inputMode="decimal" value={cantTxt} onChange={(e) => setCantTxt(e.target.value)} /></label>
                        <label>{prodSel?.vendido_por_peso ? "Costo por kg" : "Costo por unidad"}<input inputMode="decimal" value={costoTxt} onChange={(e) => setCostoTxt(e.target.value)} /></label>
                      </div>
                      <button className="sec" onClick={agregarLinea}>Agregar a la compra</button>
                      {lineas.length > 0 && (
                        <ul style={{ margin: "10px 0", paddingLeft: 20 }}>
                          {lineas.map((l) => (
                            <li key={l.producto_id}>{l.nombre} · {cantidadTexto(l.cantidad, l.por_peso)} × {peso(l.costo)}{l.por_peso ? "/kg" : ""} = <b>{peso(totalLinea(l))}</b>{" "}
                              <button className="sec" onClick={() => setLineas((ls) => ls.filter((x) => x.producto_id !== l.producto_id))} aria-label={`Quitar ${l.nombre}`}>Quitar</button></li>
                          ))}
                        </ul>
                      )}
                      <div className="row"><span>Total de la compra</span><b>{peso(total)}</b></div>
                      <div className="pos-filtros" style={{ gridTemplateColumns: "1fr 1fr" }}>
                        <label>Pagás ahora (opcional)<input inputMode="decimal" value={pagaAhora} onChange={(e) => setPagaAhora(e.target.value)} placeholder="0 = queda a cuenta" /></label>
                        <label>Medio<select value={medioCompra} onChange={(e) => setMedioCompra(e.target.value)}>{MEDIOS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                      </div>
                      <label>Comprobante (opcional)<input value={comprobante} maxLength={40} onChange={(e) => setComprobante(e.target.value)} placeholder="N° de remito o factura" /></label>
                      <div className="pos-modal-acciones">
                        <button className="sec" onClick={() => setComprando(null)}>Cancelar</button>
                        <button disabled={ocupado || lineas.length === 0} onClick={() => guardarCompra(p)}>{ocupado ? "Guardando…" : "Guardar compra"}</button>
                      </div>
                    </div>
                  )}

                  <div className="pos-filtros" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 10 }}>
                    <label>Registrar un pago<input inputMode="decimal" value={pagoMonto} onChange={(e) => setPagoMonto(e.target.value)} placeholder="Monto" /></label>
                    <label>Medio<select value={pagoMedio} onChange={(e) => setPagoMedio(e.target.value)}>{MEDIOS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                  </div>
                  <button className="sec" disabled={ocupado} onClick={() => pagar(p)}>Pagué</button>

                  <h3 style={{ marginBottom: 4 }}>Últimas compras</h3>
                  <ul style={{ margin: 0, paddingLeft: 20 }} className="mut">
                    {compras.map((c) => (
                      <li key={c.id} style={c.anulada ? { textDecoration: "line-through" } : undefined}>
                        {fecha(c.created_at)} · #{c.numero}{c.comprobante ? ` (${c.comprobante})` : ""} · {peso(c.total)}{c.pagado > 0 ? ` · pagado ${peso(c.pagado)}` : ""}{" "}
                        {c.anulada ? "· anulada" : <button className="sec" onClick={() => anular(p, c)}>Anular</button>}
                      </li>
                    ))}
                    {compras.length === 0 && <li>Sin compras todavía.</li>}
                  </ul>
                  <h3 style={{ marginBottom: 4 }}>Cuenta corriente</h3>
                  <ul style={{ margin: 0, paddingLeft: 20 }} className="mut">
                    {movs.map((m) => <li key={m.id}>{fecha(m.created_at)} · {m.tipo === "compra" ? "compra" : "pago"} {peso(m.monto)}{m.medio ? ` (${m.medio})` : ""}{m.nota ? ` · ${m.nota}` : ""}</li>)}
                    {movs.length === 0 && <li>Sin movimientos todavía.</li>}
                  </ul>
                </>
              )}
            </div>
          ))}
          {!form && <button onClick={() => setForm({ ...FORM_VACIO })}>Nuevo proveedor</button>}
          {form && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>{form.id ? "Editar proveedor" : "Nuevo proveedor"}</h3>
              <input placeholder="Nombre" value={form.nombre} maxLength={80} onChange={(e) => setForm({ ...form, nombre: e.target.value })} autoFocus />
              <input placeholder="Teléfono (opcional)" value={form.telefono} maxLength={30} inputMode="tel" onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
              <input placeholder="CUIT (opcional)" value={form.cuit} maxLength={20} onChange={(e) => setForm({ ...form, cuit: e.target.value })} />
              <input placeholder="Notas, ej. días de visita (opcional)" value={form.notas} maxLength={300} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
              <div className="pos-modal-acciones">
                <button className="sec" onClick={() => setForm(null)}>Cancelar</button>
                <button disabled={ocupado || form.nombre.trim().length < 1} onClick={guardarProveedor}>Guardar</button>
              </div>
            </div>
          )}
        </>
      )}

      {vista === "stock" && (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Ajustar stock</h3>
            <p className="mut" style={{ margin: ".2rem 0" }}>Para conteos, roturas o vencimientos. Queda registrado con el motivo.</p>
            <select value={ajProd} onChange={(e) => setAjProd(e.target.value)}>
              <option value="">Elegí un producto…</option>
              {controlados.map((x) => <option key={x.id} value={x.id}>{x.nombre} (hay {cantidadTexto(x.stock ?? 0, !!x.vendido_por_peso)})</option>)}
            </select>
            <input inputMode="decimal" placeholder={productos.find((x) => x.id === ajProd)?.vendido_por_peso ? "Stock real en kg" : "Stock real"} value={ajNuevo} onChange={(e) => setAjNuevo(e.target.value)} />
            <input placeholder="Motivo (ej. conteo, rotura)" value={ajMotivo} maxLength={200} onChange={(e) => setAjMotivo(e.target.value)} />
            <button disabled={ocupado || !ajProd || ajNuevo.trim() === "" || ajMotivo.trim().length < 3} onClick={ajustar}>Guardar ajuste</button>
          </div>
          <h3>Últimos movimientos</h3>
          {hist.length === 0 && <p className="mut">Todavía no hay movimientos. Se registran las compras, sus anulaciones y los ajustes.</p>}
          {hist.map((h) => {
            const pp = !!h.productos?.vendido_por_peso;
            return (
              <div className="card" key={h.id}>
                <div className="row"><b>{h.productos?.nombre ?? "Producto eliminado"}</b>
                  <b style={{ color: h.cantidad > 0 ? "#1e8449" : "#c0392b" }}>{h.cantidad > 0 ? "+" : "−"}{cantidadTexto(Math.abs(h.cantidad), pp)}</b></div>
                <div className="mut">{fecha(h.created_at)} · {h.tipo === "compra" ? "Compra" : h.tipo === "anulacion_compra" ? "Anulación de compra" : "Ajuste"} · quedó en {cantidadTexto(h.stock_resultante, pp)}{h.motivo ? ` · ${h.motivo}` : ""}</div>
              </div>
            );
          })}
        </>
      )}
    </>
  );
}
