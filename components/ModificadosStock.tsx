"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase, type Kiosco } from "@/lib/supabase";
import { ETIQUETA_TIPO_MOV } from "@/lib/reposicion";

// Movimientos que el sistema genera solo al vender o pedir: se ocultan salvo que el dueño los pida.
const AUTOMATICOS = new Set(["venta", "pedido", "cancelacion_pedido", "devolucion"]);
const PERIODOS: [number, string][] = [[1, "Hoy"], [7, "7 días"], [30, "30 días"]];
const LIMITE = 1000;

type Fila = {
  producto_id: string;
  tipo: string;
  cantidad: number;
  stock_resultante: number;
  created_at: string;
  productos: { nombre: string } | { nombre: string }[] | null;
};

type Resumen = { id: string; nombre: string; movs: number; neto: number; ultimo: Fila };

// Productos con cambios de stock en el período, con diferencia neta y último movimiento.
// Hoy = desde las 00:00 de Buenos Aires (UTC-3, sin horario de verano).
export default function ModificadosStock({ kiosco }: { kiosco: Kiosco }) {
  const [dias, setDias] = useState(7);
  const [incluirAutomaticos, setIncluirAutomaticos] = useState(false);
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let vivo = true;
    setFilas(null); setErr(false);
    const desde = new Date();
    if (dias === 1) {
      const ahora = new Date(Date.now() - 3 * 3600_000);
      desde.setTime(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()) + 3 * 3600_000);
    } else {
      desde.setTime(Date.now() - dias * 86400_000);
    }
    supabase
      .from("stock_movimientos")
      .select("producto_id,tipo,cantidad,stock_resultante,created_at,productos(nombre)")
      .eq("kiosco_id", kiosco.id)
      .gte("created_at", desde.toISOString())
      .order("created_at", { ascending: false })
      .limit(LIMITE)
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) { setErr(true); return; }
        setFilas((data as Fila[]) ?? []);
      });
    return () => { vivo = false; };
  }, [kiosco.id, dias]);

  const resumen = useMemo<Resumen[]>(() => {
    if (!filas) return [];
    const mapa = new Map<string, Resumen>();
    for (const f of filas) {
      if (!incluirAutomaticos && AUTOMATICOS.has(f.tipo)) continue;
      const nombre = Array.isArray(f.productos) ? f.productos[0]?.nombre : f.productos?.nombre;
      const r = mapa.get(f.producto_id);
      if (!r) {
        // Las filas vienen de la más nueva a la más vieja: la primera es el último movimiento.
        mapa.set(f.producto_id, { id: f.producto_id, nombre: nombre ?? "Producto", movs: 1, neto: f.cantidad, ultimo: f });
      } else {
        r.movs += 1; r.neto += f.cantidad;
      }
    }
    return [...mapa.values()].sort((a, b) => Math.abs(b.neto) - Math.abs(a.neto));
  }, [filas, incluirAutomaticos]);

  const hayTope = filas !== null && filas.length >= LIMITE;
  const fecha = (iso: string) => new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="card">
      <b>Productos modificados</b>
      <p className="mut" style={{ margin: "4px 0 8px" }}>Stock que cambió en el período. Sirve para revisar errores de carga o mermas sin anotar.</p>
      <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {PERIODOS.map(([n, t]) => (
          <button key={n} className={dias === n ? "" : "sec"} onClick={() => setDias(n)} aria-pressed={dias === n}>{t}</button>
        ))}
      </div>
      <label className="row" style={{ gap: 6, marginBottom: 8 }}>
        <input type="checkbox" checked={incluirAutomaticos} onChange={(e) => setIncluirAutomaticos(e.target.checked)} />
        <span>Incluir ventas y pedidos</span>
      </label>
      {err && <p role="alert" style={{ color: "#c0392b" }}>No pudimos cargar los movimientos.</p>}
      {!err && filas === null && <p className="mut">Cargando…</p>}
      {filas !== null && resumen.length === 0 && <p className="mut">Sin cambios de stock en este período.</p>}
      {resumen.map((r) => (
        <div key={r.id} className="row" style={{ justifyContent: "space-between", gap: 8, padding: "6px 0", borderTop: "1px solid #0001" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nombre}</div>
            <div className="mut" style={{ fontSize: 13 }}>
              {r.movs} movimiento{r.movs === 1 ? "" : "s"} · último: {(ETIQUETA_TIPO_MOV as Record<string, string>)[r.ultimo.tipo] ?? r.ultimo.tipo} {fecha(r.ultimo.created_at)} · queda {r.ultimo.stock_resultante}
            </div>
          </div>
          <b style={{ color: r.neto < 0 ? "#c0392b" : "#1e8449", whiteSpace: "nowrap" }}>{r.neto > 0 ? `+${r.neto}` : r.neto}</b>
        </div>
      ))}
      {hayTope && <p className="mut" style={{ fontSize: 13 }}>Se muestran los últimos {LIMITE} movimientos del período.</p>}
    </div>
  );
}
