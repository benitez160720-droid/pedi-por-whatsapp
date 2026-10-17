"use client";
import { useState } from "react";
import { supabase, type Kiosco } from "@/lib/supabase";
import { ETIQUETA_PAGO, normalizarTelefonoAR } from "@/lib/whatsapp";

export default function MiKiosco({ kiosco, onGuardado }: { kiosco: Kiosco; onGuardado: () => void }) {
  const [nombre, setNombre] = useState(kiosco.nombre);
  const [wa, setWa] = useState(kiosco.whatsapp);
  const [dir, setDir] = useState(kiosco.direccion ?? "");
  const [envio, setEnvio] = useState(kiosco.acepta_envio);
  const [horario, setHorario] = useState(kiosco.horario ?? "");
  const [minimo, setMinimo] = useState(String(kiosco.pedido_minimo ?? 0));
  const [costoEnvio, setCostoEnvio] = useState(String(kiosco.costo_envio ?? 0));
  const [pagos, setPagos] = useState<string[]>(kiosco.medios_pago ?? ["efectivo"]);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const n = (s: string) => Number(s.replace(",", "."));
  const valido = nombre.trim().length >= 2 && wa.replace(/\D/g, "").length >= 10 && n(minimo) >= 0 && n(costoEnvio) >= 0 && !isNaN(n(minimo)) && !isNaN(n(costoEnvio)) && pagos.length >= 1;

  async function guardar() {
    setGuardando(true); setMsg("");
    const { error } = await supabase.from("kioscos").update({
      nombre: nombre.trim(), whatsapp: normalizarTelefonoAR(wa), direccion: dir.trim() || null, acepta_envio: envio,
      horario: horario.trim() || null, pedido_minimo: n(minimo), costo_envio: n(costoEnvio), medios_pago: pagos,
    }).eq("id", kiosco.id);
    setGuardando(false);
    if (error) { setOk(false); setMsg("No se pudo guardar. Revisá los datos."); return; }
    setOk(true); setMsg("Guardado ✔"); onGuardado();
  }

  return (
    <>
      <h2>Datos del local</h2>
      <label>Nombre<input value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
      <label>WhatsApp donde recibís pedidos<input value={wa} onChange={(e) => setWa(e.target.value)} inputMode="tel" /></label>
      <label>Dirección (se muestra en la tienda)<input value={dir} onChange={(e) => setDir(e.target.value)} autoComplete="street-address" /></label>
      <label className="mut" style={{ display: "block", margin: "8px 0" }}>
        <input type="checkbox" checked={envio} onChange={(e) => setEnvio(e.target.checked)} style={{ width: "auto", marginRight: 8 }} />Hago envíos a domicilio
      </label>
      <label>Horario (texto que ve el cliente)<input value={horario} onChange={(e) => setHorario(e.target.value)} placeholder="Lun a Sáb 8 a 22 · Dom 9 a 14" /></label>
      <label>Pedido mínimo ($, 0 = sin mínimo)<input value={minimo} onChange={(e) => setMinimo(e.target.value)} inputMode="decimal" /></label>
      {envio && <label>Costo de envío ($, 0 = gratis)<input value={costoEnvio} onChange={(e) => setCostoEnvio(e.target.value)} inputMode="decimal" /></label>}
      <div className="mut" style={{ margin: "8px 0" }}>Medios de pago que aceptás:</div>
      {Object.entries(ETIQUETA_PAGO).map(([k, v]) => (
        <label key={k} className="mut" style={{ display: "block", margin: "4px 0" }}>
          <input type="checkbox" checked={pagos.includes(k)} onChange={(e) => setPagos(e.target.checked ? [...pagos, k] : pagos.filter((x) => x !== k))} style={{ width: "auto", marginRight: 8 }} />{v}
        </label>
      ))}
      <p className="mut">Link de la tienda: <b>/{kiosco.slug}</b> (no se cambia, para que el QR impreso siga funcionando).</p>
      {msg && <p role="status" className={ok ? "ok" : undefined} style={ok ? undefined : { color: "#c0392b" }}>{msg}</p>}
      <button disabled={!valido || guardando} onClick={guardar}>{guardando ? "Guardando…" : "Guardar"}</button>
    </>
  );
}
