"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, type Kiosco, type Pedido } from "@/lib/supabase";
import { ETIQUETA_PAGO, linkWhatsApp, normalizarTelefonoAR, peso } from "@/lib/whatsapp";

type Item = { nombre: string; cantidad: number; precio_unit: number };
type PedidoConItems = Pedido & { pedido_items: Item[]; fiado_movimientos: { id: string }[] | { id: string } | null };
// PostgREST devuelve objeto (relación 1 a 1) o lista según la versión: se acepta ambos.
const tieneFiado = (p: PedidoConItems) => Array.isArray(p.fiado_movimientos) ? p.fiado_movimientos.length > 0 : !!p.fiado_movimientos;
const ERRORES_FIADO: Record<string, string> = {
  sin_cliente: "Este pedido no tiene un cliente asociado. Anotalo a mano en Fiado.",
  estado_invalido: "Primero confirmá el pedido.",
  monto_invalido: "El pedido no tiene un total para anotar.",
};
type Filtro = "hoy" | "pendientes" | "todos";

// Aviso sonoro: el celular suele estar en el bolsillo o el mostrador, y en iPhone no hay vibración.
function pitar() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    [0, 0.25].forEach((t) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.25, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.2);
    });
    setTimeout(() => ctx.close(), 800);
  } catch { /* sin audio: queda la vibración y el título */ }
}

const inicioDelDia = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };

function mensajeAviso(k: Kiosco, p: Pedido) {
  const base = `Hola ${p.cliente_nombre}! Te escribimos de ${k.nombre} por tu pedido #${p.numero}.`;
  if (p.estado === "pendiente") return `${base} Lo recibimos y en un momento te lo confirmamos.`;
  if (p.estado === "confirmado") return `${base} Ya está confirmado. ${p.modalidad === "envio" ? "Te lo llevamos en breve." : "Podés pasar a retirarlo."}`;
  if (p.estado === "entregado") return `${base} Gracias por tu compra!`;
  return `${base} Lo tuvimos que cancelar, disculpá. Escribinos si querés rehacerlo.`;
}

export default function Pedidos({ kiosco }: { kiosco: Kiosco }) {
  const [lista, setLista] = useState<PedidoConItems[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("hoy");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [cargado, setCargado] = useState(false);
  const [enVivo, setEnVivo] = useState(false);
  const enVivoRef = useRef(false);
  const pendientesPrev = useRef<number | null>(null);
  const [sonido, setSonido] = useState(true);
  const sonidoRef = useRef(true);
  sonidoRef.current = sonido;

  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("pedidos")
      .select("*, pedido_items(nombre,cantidad,precio_unit), fiado_movimientos(id)")
      .eq("kiosco_id", kiosco.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (err) { setError("No pudimos actualizar los pedidos. Revisá la conexión."); return; }
    setError(""); setCargado(true);
    const rows = (data ?? []) as PedidoConItems[];
    setLista(rows);
    const pend = rows.filter((p) => p.estado === "pendiente").length;
    if (pendientesPrev.current !== null && pend > pendientesPrev.current) {
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      if (sonidoRef.current) pitar();
    }
    pendientesPrev.current = pend;
    document.title = pend > 0 ? `(${pend}) Pedidos · ${kiosco.nombre}` : `Pedidos · ${kiosco.nombre}`;
  }, [kiosco.id, kiosco.nombre]);

  useEffect(() => {
    cargar();
    // Con Realtime conectado alcanza una consulta cada ~minuto como red de seguridad; sin él, cada 15 s.
    let tick = 0;
    const t = setInterval(() => { tick++; if (document.visibilityState === "visible" && (!enVivoRef.current || tick % 4 === 0)) cargar(); }, 15000);
    const onVis = () => { if (document.visibilityState === "visible") cargar(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); document.title = "Pedí por WhatsApp"; };
  }, [cargar]);

  // Realtime: el pedido aparece al instante (la base solo envía los del propio kiosco, por RLS).
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const refrescar = () => { clearTimeout(t); t = setTimeout(() => cargar(), 250); };
    const cfg = (event: "INSERT" | "UPDATE") => ({ event, schema: "public", table: "pedidos", filter: `kiosco_id=eq.${kiosco.id}` }) as const;
    const canal = supabase.channel(`pedidos-${kiosco.id}`)
      .on("postgres_changes", cfg("INSERT"), refrescar)
      .on("postgres_changes", cfg("UPDATE"), refrescar)
      .subscribe((st) => { enVivoRef.current = st === "SUBSCRIBED"; setEnVivo(st === "SUBSCRIBED"); });
    return () => { clearTimeout(t); enVivoRef.current = false; supabase.removeChannel(canal); };
  }, [kiosco.id, cargar]);

  async function estado(id: string, e: Pedido["estado"]) {
    const { error: err } = await supabase.from("pedidos").update({ estado: e }).eq("id", id);
    if (err) setError(err.message?.includes("sin_stock") ? "No hay stock suficiente para confirmar este pedido. Revisá las cantidades en Productos." : "No se pudo cambiar el estado."); else cargar();
  }

  // Un toque: deja el pedido entregado (suma el sello) y anota el total en la libreta del cliente.
  async function aFiado(p: PedidoConItems) {
    setError(""); setAviso("");
    const { data, error: err } = await supabase.rpc("pasar_a_fiado", { p_pedido: p.id });
    if (err) { setError(ERRORES_FIADO[Object.keys(ERRORES_FIADO).find((k) => err.message.includes(k)) ?? ""] ?? "No se pudo anotar el fiado. Probá de nuevo."); return; }
    const saldo = Number((data as { saldo: number }).saldo);
    setAviso(`${(data as { ya_estaba: boolean }).ya_estaba ? "Ya estaba anotado" : "Anotado en Fiado ✔"} · ${p.cliente_nombre} debe ${peso(saldo)} en total.`);
    cargar();
  }
  async function quitarFiado(p: PedidoConItems) {
    if (!confirm(`¿Quitar el fiado del pedido #${p.numero} (${peso(Number(p.total))})? Se descuenta de lo que debe ${p.cliente_nombre}.`)) return;
    const { error: err } = await supabase.from("fiado_movimientos").delete().eq("pedido_id", p.id);
    if (err) { setError("No se pudo quitar el fiado."); return; }
    setAviso("Fiado quitado del pedido."); cargar();
  }

  const desde = inicioDelDia();
  const hoy = lista.filter((p) => p.created_at >= desde);
  const vendidoHoy = hoy.filter((p) => p.estado !== "cancelado").reduce((s, p) => s + Number(p.total), 0);
  const pendientes = lista.filter((p) => p.estado === "pendiente").length;
  const visibles = filtro === "hoy" ? hoy : filtro === "pendientes" ? lista.filter((p) => p.estado === "pendiente" || p.estado === "confirmado") : lista;

  return (
    <>
      <div className="card row" style={{ textAlign: "center" }}>
        <div><b style={{ fontSize: 24 }}>{pendientes}</b><div className="mut">por confirmar</div></div>
        <div><b style={{ fontSize: 24 }}>{hoy.length}</b><div className="mut">pedidos hoy</div></div>
        <div><b style={{ fontSize: 24 }}>{peso(vendidoHoy)}</b><div className="mut">pedido hoy</div></div>
      </div>
      <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
        {(["hoy", "pendientes", "todos"] as Filtro[]).map((f) => (
          <button key={f} className={filtro === f ? "" : "sec"} onClick={() => setFiltro(f)}>{f === "hoy" ? "Hoy" : f === "pendientes" ? "Abiertos" : "Todos"}</button>
        ))}
      </div>
      <div className="mut" style={{ margin: "4px 0" }} role="status">{enVivo ? "● En vivo: los pedidos aparecen al instante" : "Actualizando cada 15 segundos"}</div>
      <label className="mut" style={{ display: "block", margin: "6px 0" }}>
        <input type="checkbox" checked={sonido} onChange={(e) => setSonido(e.target.checked)} style={{ width: "auto", marginRight: 8 }} />Sonido cuando llega un pedido
      </label>
      {error && <p role="alert" style={{ color: "#c0392b" }}>{error}</p>}
      {aviso && <p role="status" className="mut">{aviso}</p>}
      {cargado && visibles.length === 0 && <p className="mut">No hay pedidos para mostrar.</p>}
      {visibles.map((p) => (
        <div className="card" key={p.id}>
          <div className="row" onClick={() => setAbierto(abierto === p.id ? null : p.id)} style={{ cursor: "pointer" }}>
            <b>#{p.numero} · {p.cliente_nombre}</b><span className="tag">{p.estado}{tieneFiado(p) ? " · fiado" : ""}</span>
          </div>
          <div className="mut">
            {new Date(p.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} · {p.modalidad === "envio" ? `Envío: ${p.direccion}` : "Retiro"} · {peso(Number(p.total))} · {ETIQUETA_PAGO[p.medio_pago] ?? p.medio_pago}
          </div>
          {abierto === p.id && (
            <ul style={{ margin: "8px 0", paddingLeft: 20 }}>
              {p.pedido_items.map((i, n) => (<li key={n}>{i.cantidad} x {i.nombre} — {peso(Number(i.precio_unit) * i.cantidad)}</li>))}
              {Number(p.costo_envio) > 0 && <li>Envío — {peso(Number(p.costo_envio))}</li>}
              {p.notas && <li><i>Nota: {p.notas}</i></li>}
            </ul>
          )}
          <div className="row" style={{ justifyContent: "flex-start", marginTop: 8, flexWrap: "wrap" }}>
            {p.estado === "pendiente" && <button onClick={() => estado(p.id, "confirmado")}>Confirmar</button>}
            {p.estado === "confirmado" && (<>
              <button onClick={() => estado(p.id, "entregado")}>Entregado</button>
              <button className="sec" onClick={() => aFiado(p)}>Entregado a fiado</button>
            </>)}
            {p.estado === "entregado" && !tieneFiado(p) && <button className="sec" onClick={() => aFiado(p)}>Pasar a fiado</button>}
            {p.estado === "entregado" && tieneFiado(p) && <button className="sec" onClick={() => quitarFiado(p)}>Quitar fiado</button>}
            <a className="btn sec" href={linkWhatsApp(normalizarTelefonoAR(p.cliente_telefono), mensajeAviso(kiosco, p))}>Avisar</a>
            {(p.estado === "pendiente" || p.estado === "confirmado") && (
              <button className="sec" onClick={() => { if (confirm(`¿Cancelar el pedido #${p.numero}?`)) estado(p.id, "cancelado"); }}>Cancelar</button>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
