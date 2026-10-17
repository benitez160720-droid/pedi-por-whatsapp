"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, type Kiosco } from "@/lib/supabase";
import { fecha, mensajeError, norm, totalesCarrito, type Cliente, type LineaCarrito, type PagoVenta, type ProductoPos, type Turno } from "@/lib/caja";
import { peso } from "@/lib/whatsapp";
import Escaner from "../Escaner";
import CobroModal from "./CobroModal";
import Ticket, { type TicketData } from "./Ticket";

type Espera = { id: number; at: number; lineas: LineaCarrito[]; descPct: string; cliente: Cliente | null };
export type Destino = "movimientos" | "cierre" | "z";

const AYUDA: [string, string][] = [
  ["F1 / 1", "Ayuda: este listado"], ["F2 / 2", "Cobrar"], ["F3 / 3", "Descuento global"], ["F4 / 4", "Nueva venta (vaciar)"],
  ["F5 / 5", "Buscar producto"], ["F6 / 6", "Elegir cliente"], ["F7 / 7", "Movimiento de caja"], ["F8 / 8", "Cerrar caja"],
  ["F9 / 9", "Reporte Z"], ["F10 / 0", "Escanear con la cámara"], ["+ / −", "Cantidad del último ítem"], ["Supr", "Quitar último ítem"],
  ["Enter", "Cobrar / confirmar"], ["Esc", "Cerrar"],
];
const enCampoDeTexto = () => { const a = document.activeElement as HTMLElement | null; return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable); };

export default function PosVenta({ kiosco, turno, productos, favoritos, clientes, activo, onVendida, onIr }: {
  kiosco: Kiosco; turno: Turno; productos: ProductoPos[]; favoritos: string[]; clientes: Cliente[];
  activo: boolean; onVendida: () => void; onIr: (d: Destino) => void;
}) {
  const [lineas, setLineas] = useState<LineaCarrito[]>([]);
  const [descPct, setDescPct] = useState("");
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [buscaCliente, setBuscaCliente] = useState(false);
  const [filtroCliente, setFiltroCliente] = useState("");
  const [espera, setEspera] = useState<Espera[]>([]);
  const [cobrando, setCobrando] = useState(false);
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [ayuda, setAyuda] = useState(false);
  const [escaneando, setEscaneando] = useState(false);
  const [msg, setMsg] = useState("");
  const inputProd = useRef<HTMLInputElement>(null);
  const inputDesc = useRef<HTMLInputElement>(null);
  const inputCli = useRef<HTMLInputElement>(null);

  const tot = useMemo(() => totalesCarrito(lineas, Number(descPct.replace(",", "."))), [lineas, descPct]);
  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const favs = useMemo(() => favoritos.map((id) => porId.get(id)).filter((p): p is ProductoPos => !!p && p.disponible), [favoritos, porId]);

  const resultados = useMemo(() => {
    const q = norm(busqueda.trim());
    if (!q) return [];
    return productos.filter((p) => p.disponible && (norm(p.nombre).includes(q) || norm(p.categoria).includes(q) || (p.barcode ?? "").includes(q))).slice(0, 8);
  }, [busqueda, productos]);
  const clientesFiltrados = useMemo(() => {
    const q = norm(filtroCliente.trim());
    return clientes.filter((c) => !q || norm(c.nombre).includes(q) || c.telefono.includes(q)).slice(0, 6);
  }, [clientes, filtroCliente]);

  const agregar = useCallback((p: ProductoPos) => {
    setMsg("");
    setLineas((ls) => {
      const i = ls.findIndex((l) => l.producto_id === p.id);
      const actual = i >= 0 ? ls[i].cantidad : 0;
      if (actual + 1 > 99) { setMsg("Máximo 99 unidades por producto."); return ls; }
      if (p.stock_controlado && actual + 1 > p.stock) { setMsg(`Sin stock suficiente de ${p.nombre} (quedan ${p.stock}).`); return ls; }
      if (i >= 0) return ls.map((l, k) => (k === i ? { ...l, cantidad: l.cantidad + 1 } : l));
      return [...ls, { producto_id: p.id, nombre: p.nombre, precio: p.precio, cantidad: 1, stock_controlado: p.stock_controlado, stock: p.stock }];
    });
    setBusqueda("");
  }, []);

  const cambiarCantidad = useCallback((i: number, n: number) => {
    setLineas((ls) => {
      const l = ls[i]; if (!l) return ls;
      if (n < 1) return ls.filter((_, k) => k !== i);
      const tope = l.stock_controlado ? Math.min(99, l.stock) : 99;
      if (n > tope) { setMsg(l.stock_controlado && n > l.stock ? `Sin stock suficiente de ${l.nombre} (quedan ${l.stock}).` : "Máximo 99 unidades por producto."); return ls; }
      setMsg("");
      return ls.map((x, k) => (k === i ? { ...x, cantidad: n } : x));
    });
  }, []);

  const vaciar = useCallback(() => {
    if (!lineas.length && !cliente && !descPct) return;
    if (lineas.length && !window.confirm("¿Vaciar todo el carrito?")) return;
    setLineas([]); setDescPct(""); setCliente(null); setMsg("");
    inputProd.current?.focus();
  }, [lineas.length, cliente, descPct]);

  const ponerEnEspera = () => {
    if (!lineas.length) return;
    setEspera((e) => [...e, { id: Date.now(), at: Date.now(), lineas, descPct, cliente }]);
    setLineas([]); setDescPct(""); setCliente(null);
    inputProd.current?.focus();
  };
  const retomar = (id: number) => {
    const e = espera.find((x) => x.id === id); if (!e) return;
    setEspera((es) => {
      const resto = es.filter((x) => x.id !== id);
      return lineas.length ? [...resto, { id: Date.now(), at: Date.now(), lineas, descPct, cliente }] : resto;
    });
    setLineas(e.lineas); setDescPct(e.descPct); setCliente(e.cliente);
  };

  const abrirCobro = useCallback(() => { if (lineas.length && tot.total > 0) setCobrando(true); else if (lineas.length) setMsg("El total es $ 0: revisá el descuento."); }, [lineas.length, tot.total]);

  async function confirmarCobro(pagos: PagoVenta[]): Promise<string | null> {
    const { data, error } = await supabase.rpc("registrar_venta_mostrador", {
      p_turno: turno.id,
      p_items: lineas.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad })),
      p_pagos: pagos,
      p_cliente: cliente?.id ?? null,
      p_descuento_pct: tot.pct,
    });
    if (error) return mensajeError(error.message);
    const r = data as { numero: number; subtotal: number; descuento: number; total: number; vuelto: number };
    setTicket({
      numero: Number(r.numero), fecha: fecha(new Date().toISOString()), kioscoNombre: kiosco.nombre, cliente: cliente?.nombre ?? null,
      items: lineas.map((l) => ({ nombre: l.nombre, cantidad: l.cantidad, precio_unit: l.precio })),
      subtotal: Number(r.subtotal), descuento: Number(r.descuento), descuentoPct: tot.pct || undefined, total: Number(r.total), pagos, vuelto: Number(r.vuelto),
    });
    setCobrando(false); setLineas([]); setDescPct(""); setCliente(null); setMsg("");
    onVendida();
    return null;
  }

  const alEscanear = (codigo: string) => {
    setEscaneando(false);
    const p = productos.find((x) => x.barcode === codigo && x.disponible);
    if (p) agregar(p); else setMsg(`No encontramos un producto con el código ${codigo}.`);
  };

  // Atajos de teclado: cada acción tiene F-tecla y dígito (en notebooks la fila F suele ser multimedia).
  useEffect(() => {
    if (!activo) return;
    const h = (e: KeyboardEvent) => {
      if (cobrando || ticket || escaneando) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const es = (f: string, d: string) => { if (e.key === f) return true; return e.key === d && !enCampoDeTexto(); };
      const hacer = (fn: () => void) => { e.preventDefault(); fn(); };
      if (ayuda) { if (e.key === "Escape" || e.key === "Enter" || es("F1", "1")) hacer(() => setAyuda(false)); return; }
      if (es("F1", "1")) return hacer(() => setAyuda(true));
      if (es("F2", "2")) return hacer(abrirCobro);
      if (es("F3", "3")) return hacer(() => { if (lineas.length) inputDesc.current?.focus(); });
      if (es("F4", "4")) return hacer(vaciar);
      if (es("F5", "5")) return hacer(() => inputProd.current?.focus());
      if (es("F6", "6")) return hacer(() => { setBuscaCliente(true); setTimeout(() => inputCli.current?.focus(), 0); });
      if (es("F7", "7")) return hacer(() => onIr("movimientos"));
      if (es("F8", "8")) return hacer(() => onIr("cierre"));
      if (es("F9", "9")) return hacer(() => onIr("z"));
      if (es("F10", "0")) return hacer(() => setEscaneando(true));
      if (enCampoDeTexto()) return;
      if ((e.key === "+" || e.key === "-") && lineas.length) return hacer(() => cambiarCantidad(lineas.length - 1, lineas[lineas.length - 1].cantidad + (e.key === "+" ? 1 : -1)));
      if ((e.key === "Delete" || e.key === "Backspace") && lineas.length) return hacer(() => cambiarCantidad(lineas.length - 1, 0));
      if (e.key === "Enter" && lineas.length) return hacer(abrirCobro);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [activo, cobrando, ticket, escaneando, ayuda, lineas, abrirCobro, vaciar, cambiarCantidad, onIr]);

  const onEnterBusqueda = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault(); e.stopPropagation();
    const q = busqueda.trim();
    if (!q) { if (lineas.length) abrirCobro(); return; }
    const exacto = productos.find((p) => p.barcode === q && p.disponible);
    if (exacto) return agregar(exacto);
    if (resultados.length) agregar(resultados[0]); else setMsg("No encontramos ese producto.");
  };

  const hace = (at: number) => { const m = Math.max(0, Math.round((Date.now() - at) / 60000)); return m < 1 ? "recién" : `hace ${m} min`; };

  return (
    <div className="pos-venta">
      <div className="pos-izq card">
        <div className="pos-buscador">
          <div className="pos-busqueda-wrap">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
            <input ref={inputProd} autoFocus value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setMsg(""); }} onKeyDown={onEnterBusqueda}
              placeholder="Código de barras o nombre del producto…" aria-label="Buscar producto" autoComplete="off" />
          </div>
          <button type="button" className="sec" onClick={() => setEscaneando(true)} title="Escanear con la cámara (F10 o 0)">Cámara</button>
          {resultados.length > 0 && (
            <div className="pos-resultados" role="listbox">
              {resultados.map((p) => (
                <button type="button" key={p.id} className="pos-resultado" onClick={() => agregar(p)}>
                  <span>{p.nombre}<small className="mut"> · {p.categoria}</small></span>
                  <span className="mono">{peso(p.precio)}{p.stock_controlado && <small className="mut"> · stock {p.stock}</small>}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {msg && <p className="pos-error" role="alert">{msg}</p>}
        {favs.length > 0 && (
          <div className="pos-favoritos" aria-label="Favoritos">
            {favs.map((p) => (<button type="button" key={p.id} className="pos-fav" onClick={() => agregar(p)}><span>{p.nombre}</span><b className="mono">{peso(p.precio)}</b></button>))}
          </div>
        )}
        <div className="pos-tabla" role="table" aria-label="Detalle del ticket">
          <div className="pos-tabla-head" aria-hidden="true"><span>#</span><span>Producto</span><span>Cantidad</span><span>Precio</span><span>Importe</span><span /></div>
          {lineas.length === 0 ? (
            <div className="pos-vacio"><strong>Escaneá un producto para empezar</strong><span>O buscalo por nombre o código en el campo de arriba.</span></div>
          ) : lineas.map((l, i) => (
            <div className="pos-linea" key={l.producto_id} role="row">
              <span className="mut">{i + 1}</span>
              <span>{l.nombre}{l.stock_controlado && <small className="mut"> · stock {l.stock}</small>}</span>
              <span className="qty">
                <button type="button" className="sec" onClick={() => cambiarCantidad(i, l.cantidad - 1)} aria-label="Menos">−</button>
                <b>{l.cantidad}</b>
                <button type="button" className="sec" onClick={() => cambiarCantidad(i, l.cantidad + 1)} aria-label="Más">+</button>
              </span>
              <span className="mono">{peso(l.precio)}</span>
              <b className="mono">{peso(l.precio * l.cantidad)}</b>
              <button type="button" className="sec pos-x" onClick={() => cambiarCantidad(i, 0)} aria-label={`Quitar ${l.nombre}`}>✕</button>
            </div>
          ))}
        </div>
      </div>

      <div className="pos-der">
        {espera.length > 0 && (
          <div className="pos-espera card" aria-label="Ventas en espera">
            <p className="pos-kicker">En espera</p>
            {espera.map((e, i) => (<button type="button" className="sec" key={e.id} onClick={() => retomar(e.id)}>Venta {i + 1} · {hace(e.at)}</button>))}
          </div>
        )}
        <div className="pos-totales">
          <div className="row"><span>Subtotal</span><span className="mono">{peso(tot.subtotal)}</span></div>
          {tot.descuento > 0 && <div className="row"><span>Descuento {tot.pct}%</span><span className="mono">−{peso(tot.descuento)}</span></div>}
          {lineas.length > 0 && (
            <label className="pos-desc">Descuento global (%)
              <input ref={inputDesc} type="number" min={0} max={100} step={1} inputMode="decimal" placeholder="0" value={descPct}
                onChange={(e) => setDescPct(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); inputProd.current?.focus(); } }} />
            </label>
          )}
          <div className="pos-total-grande"><span>Total</span><b className="mono">{peso(tot.total)}</b></div>
          <button type="button" className="pos-cobrar" onClick={abrirCobro} disabled={!lineas.length}><span>Cobrar</span><kbd>F2</kbd></button>
          <div className="pos-acciones">
            <button type="button" className="sec" onClick={vaciar} disabled={!lineas.length && !cliente}>Nueva venta <kbd>F4</kbd></button>
            <button type="button" className="sec" onClick={ponerEnEspera} disabled={!lineas.length} title="Guarda esta venta para retomarla después">En espera</button>
            <button type="button" className="sec" onClick={() => inputDesc.current?.focus()} disabled={!lineas.length}>Descuento <kbd>F3</kbd></button>
          </div>
        </div>

        <div className="card pos-cliente">
          <p className="pos-kicker">Datos del cliente</p>
          <div className="row">
            <span><span className="mut">Cliente </span><b>{cliente?.nombre ?? "Consumidor final"}</b></span>
            <span className="pos-cli-acc">
              <button type="button" className="sec" onClick={() => { setBuscaCliente((v) => !v); setTimeout(() => inputCli.current?.focus(), 0); }} title="Atajo: F6 o 6">Elegir cliente</button>
              {cliente && <button type="button" className="sec" onClick={() => setCliente(null)}>Quitar</button>}
            </span>
          </div>
          {cliente && <p className="mut pos-saldo">Saldo en cuenta corriente: <b className={cliente.saldo > 0 ? "neg" : "ok"}>{peso(cliente.saldo)}</b></p>}
          {buscaCliente && (
            <div className="pos-cli-buscar">
              <input ref={inputCli} value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} placeholder="Buscar por nombre o teléfono…" aria-label="Buscar cliente" autoComplete="off"
                onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setBuscaCliente(false); } if (e.key === "Enter" && clientesFiltrados[0]) { e.preventDefault(); setCliente(clientesFiltrados[0]); setBuscaCliente(false); setFiltroCliente(""); inputProd.current?.focus(); } }} />
              {clientesFiltrados.map((c) => (
                <button type="button" className="pos-resultado" key={c.id} onClick={() => { setCliente(c); setBuscaCliente(false); setFiltroCliente(""); }}>
                  <span>{c.nombre}<small className="mut"> · {c.telefono}</small></span><span className="mono">{peso(c.saldo)}</span>
                </button>
              ))}
              {clientesFiltrados.length === 0 && <p className="mut">Sin resultados. Los clientes se crean desde un pedido o en Fiado.</p>}
            </div>
          )}
        </div>

        <div className="card pos-info">
          <div className="row"><span className="mut">Fecha</span><b>{fecha(new Date().toISOString())}</b></div>
          <div className="row"><span className="mut">Comprobante</span><b>Ticket</b></div>
          <div className="row"><span className="mut">Caja abierta</span><b>{fecha(turno.abierto_at)}</b></div>
          <button type="button" className="pos-cerrar" onClick={() => onIr("cierre")} title="Atajo: F8 o 8">Cerrar caja <kbd>F8</kbd></button>
        </div>
      </div>

      <div className="pos-hints" aria-hidden="true">
        {AYUDA.slice(1, 8).map(([k, v]) => (<span key={k}><kbd>{k}</kbd> {v}</span>))}
        <span><kbd>F1</kbd> Ayuda</span>
      </div>

      {cobrando && <CobroModal total={tot.total} cliente={cliente} onCancelar={() => { setCobrando(false); inputProd.current?.focus(); }} onConfirmar={confirmarCobro} />}
      {ticket && <Ticket t={ticket} onCerrar={() => { setTicket(null); setTimeout(() => inputProd.current?.focus(), 0); }} />}
      {escaneando && <Escaner onCode={alEscanear} onClose={() => setEscaneando(false)} />}
      {ayuda && (
        <div className="pos-overlay" role="dialog" aria-modal="true" aria-label="Atajos de teclado" onClick={() => setAyuda(false)}>
          <div className="pos-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pos-modal-head"><h2>Atajos de teclado</h2><button className="sec pos-x" onClick={() => setAyuda(false)} aria-label="Cerrar">✕</button></div>
            <div className="pos-ayuda">{AYUDA.map(([k, v]) => (<div className="row" key={k}><kbd>{k}</kbd><span>{v}</span></div>))}</div>
            <p className="mut">Cada acción tiene dos teclas: en varias notebooks la fila F1–F12 es multimedia.</p>
          </div>
        </div>
      )}
    </div>
  );
}
