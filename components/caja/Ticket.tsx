"use client";
import { useEffect } from "react";
import { ETIQUETA_MEDIO, type ItemVenta, type PagoVenta } from "@/lib/caja";
import { peso } from "@/lib/whatsapp";

export type TicketData = {
  numero: number; fecha: string; kioscoNombre: string; cliente: string | null;
  items: ItemVenta[]; subtotal: number; descuento: number; descuentoPct?: number; total: number;
  pagos: PagoVenta[]; vuelto: number; anulada?: boolean;
};

// Ticket en pantalla y para impresora térmica (window.print). Enter cierra, P imprime.
export default function Ticket({ t, onCerrar }: { t: TicketData; onCerrar: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onCerrar(); }
      else if (e.key.toLowerCase() === "p" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); window.print(); }
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [onCerrar]);
  return (
    <div className="pos-overlay" role="dialog" aria-modal="true" aria-label={`Ticket ${t.numero}`}>
      <div className="pos-modal pos-modal--ticket">
        <div className="ticket-print" id="ticket-imprimible">
          <div className="ticket-cab">
            <b>{t.kioscoNombre}</b>
            <span>Ticket N° {t.numero}</span>
            <span>{t.fecha}</span>
            <span>Cliente: {t.cliente ?? "Consumidor final"}</span>
            {t.anulada && <b className="ticket-anulado">ANULADO</b>}
          </div>
          <div className="ticket-items">
            {t.items.map((i, k) => (
              <div className="ticket-linea" key={k}><span>{i.cantidad} × {i.nombre}</span><span>{peso(i.cantidad * i.precio_unit)}</span></div>
            ))}
          </div>
          <div className="ticket-tot">
            <div className="ticket-linea"><span>Subtotal</span><span>{peso(t.subtotal)}</span></div>
            {t.descuento > 0 && <div className="ticket-linea"><span>Descuento{t.descuentoPct ? ` ${t.descuentoPct}%` : ""}</span><span>−{peso(t.descuento)}</span></div>}
            <div className="ticket-linea ticket-total"><span>TOTAL</span><span>{peso(t.total)}</span></div>
          </div>
          <div className="ticket-pagos">
            {t.pagos.map((p, k) => (<div className="ticket-linea" key={k}><span>{ETIQUETA_MEDIO[p.medio]}</span><span>{peso(p.monto)}</span></div>))}
            {t.vuelto > 0 && <div className="ticket-linea"><span>Vuelto</span><span>{peso(t.vuelto)}</span></div>}
          </div>
          <p className="ticket-gracias">¡Gracias por su compra!</p>
        </div>
        <div className="pos-modal-acciones no-print">
          <button className="sec" onClick={onCerrar}>Cerrar <kbd>Enter</kbd></button>
          <button onClick={() => window.print()}>Imprimir <kbd>P</kbd></button>
        </div>
      </div>
    </div>
  );
}
