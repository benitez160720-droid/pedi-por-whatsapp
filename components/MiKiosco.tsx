"use client";
import { useState } from "react";
import { supabase, type Kiosco } from "@/lib/supabase";
import { ETIQUETA_PAGO, normalizarTelefonoAR } from "@/lib/whatsapp";
import { DIAS, MAX_TRAMOS, ORDEN_SEMANA, hayDiasAbiertos, horariosValidos, resumenHorario, type Horarios } from "@/lib/horario";

export default function MiKiosco({ kiosco, onGuardado }: { kiosco: Kiosco; onGuardado: () => void }) {
  const [nombre, setNombre] = useState(kiosco.nombre);
  const [wa, setWa] = useState(kiosco.whatsapp);
  const [dir, setDir] = useState(kiosco.direccion ?? "");
  const [envio, setEnvio] = useState(kiosco.acepta_envio);
  const [horario, setHorario] = useState(kiosco.horario ?? "");
  const [auto, setAuto] = useState(kiosco.horario_auto ?? false);
  const [hs, setHs] = useState<Horarios>(kiosco.horarios ?? {});
  const [minimo, setMinimo] = useState(String(kiosco.pedido_minimo ?? 0));
  const [costoEnvio, setCostoEnvio] = useState(String(kiosco.costo_envio ?? 0));
  const [pagos, setPagos] = useState<string[]>(kiosco.medios_pago ?? ["efectivo"]);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const n = (s: string) => Number(s.replace(",", "."));
  const valido = nombre.trim().length >= 2 && wa.replace(/\D/g, "").length >= 10 && n(minimo) >= 0 && n(costoEnvio) >= 0 && !isNaN(n(minimo)) && !isNaN(n(costoEnvio)) && pagos.length >= 1
    && (!auto || (horariosValidos(hs) && hayDiasAbiertos(hs)));

  const dia = (d: number) => hs[String(d)] ?? [];
  const poner = (d: number, ts: { desde: string; hasta: string }[]) => setHs((p) => { const n = { ...p }; if (ts.length) n[String(d)] = ts; else delete n[String(d)]; return n; });
  const copiarLunes = () => setHs(Object.fromEntries(ORDEN_SEMANA.filter((d) => dia(1).length).map((d) => [String(d), dia(1).map((t) => ({ ...t }))])));

  async function guardar() {
    setGuardando(true); setMsg("");
    const { error } = await supabase.from("kioscos").update({
      nombre: nombre.trim(), whatsapp: normalizarTelefonoAR(wa), direccion: dir.trim() || null, acepta_envio: envio,
      horario: horario.trim() || null, horario_auto: auto, horarios: hs, pedido_minimo: n(minimo), costo_envio: n(costoEnvio), medios_pago: pagos,
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
      <label className="mut" style={{ display: "block", margin: "8px 0" }}>
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} style={{ width: "auto", marginRight: 8 }} />Abrir y cerrar la tienda sola, según mi horario
      </label>
      {!auto && <label>Horario (texto que ve el cliente)<input value={horario} onChange={(e) => setHorario(e.target.value)} placeholder="Lun a Sáb 8 a 22 · Dom 9 a 14" /></label>}
      {auto && (
        <div className="card">
          <p className="mut" style={{ marginTop: 0 }}>Fuera de este horario la tienda se ve cerrada y no recibe pedidos. Si cerrás más tarde de medianoche, poné la hora real (ej. 20:00 a 02:00). Sigue habiendo un botón para pausarla cuando quieras.</p>
          {ORDEN_SEMANA.map((d) => (
            <div key={d} style={{ margin: "8px 0" }}>
              <label style={{ display: "block" }}>
                <input type="checkbox" checked={dia(d).length > 0} onChange={(e) => poner(d, e.target.checked ? [{ desde: "08:00", hasta: "22:00" }] : [])} style={{ width: "auto", marginRight: 8 }} />
                <b>{DIAS[d]}</b>{dia(d).length === 0 && <span className="mut"> · cerrado</span>}
              </label>
              {dia(d).map((t, i) => (
                <div key={i} className="row" style={{ justifyContent: "flex-start", margin: "4px 0 0 28px", flexWrap: "wrap" }}>
                  <input type="time" value={t.desde} aria-label={`${DIAS[d]} abre`} style={{ width: "auto", margin: 0 }}
                    onChange={(e) => poner(d, dia(d).map((x, j) => (j === i ? { ...x, desde: e.target.value } : x)))} />
                  <span>a</span>
                  <input type="time" value={t.hasta} aria-label={`${DIAS[d]} cierra`} style={{ width: "auto", margin: 0 }}
                    onChange={(e) => poner(d, dia(d).map((x, j) => (j === i ? { ...x, hasta: e.target.value } : x)))} />
                  {dia(d).length > 1 && <button type="button" className="sec" style={{ padding: "6px 10px" }} onClick={() => poner(d, dia(d).filter((_, j) => j !== i))} aria-label="Quitar turno">✕</button>}
                </div>
              ))}
              {dia(d).length > 0 && dia(d).length < MAX_TRAMOS && (
                <button type="button" className="sec" style={{ margin: "6px 0 0 28px", padding: "6px 12px", fontSize: 15 }}
                  onClick={() => poner(d, [...dia(d), { desde: "17:00", hasta: "22:00" }])}>+ Agregar turno (corte de siesta)</button>
              )}
            </div>
          ))}
          <button type="button" className="sec" onClick={copiarLunes} disabled={dia(1).length === 0}>Copiar el horario del lunes a toda la semana</button>
          {!hayDiasAbiertos(hs) && <p role="alert" style={{ color: "#c0392b" }}>Marcá al menos un día abierto.</p>}
          {hayDiasAbiertos(hs) && !horariosValidos(hs) && <p role="alert" style={{ color: "#c0392b" }}>Revisá las horas: abrir y cerrar no pueden ser iguales.</p>}
          {hayDiasAbiertos(hs) && horariosValidos(hs) && <p className="mut" style={{ marginBottom: 0 }}>Se muestra así: {resumenHorario(hs)}</p>}
        </div>
      )}
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
