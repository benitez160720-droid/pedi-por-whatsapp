"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase, type Kiosco } from "@/lib/supabase";
import { linkWhatsApp, normalizarTelefonoAR, peso } from "@/lib/whatsapp";

type Cli = { id: string; nombre: string; telefono: string; saldo: number; ultimo_movimiento: string | null };
type Mov = { id: string; tipo: "fiado" | "pago"; monto: number; created_at: string; nota: string | null };
const num = (s: string) => Number(s.replace(",", "."));

export default function Fiado({ kiosco }: { kiosco: Kiosco }) {
  const [lista, setLista] = useState<Cli[]>([]);
  const [soloDeuda, setSoloDeuda] = useState(true);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [movs, setMovs] = useState<Mov[]>([]);
  const [monto, setMonto] = useState("");
  const [nNombre, setNNombre] = useState(""); const [nTel, setNTel] = useState("");
  const [msg, setMsg] = useState("");

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from("clientes_saldo").select("*").eq("kiosco_id", kiosco.id).order("saldo", { ascending: false }).order("nombre");
    if (error) setMsg("No pudimos cargar la libreta."); else setLista((data ?? []).map((c) => ({ ...c, saldo: Number(c.saldo) })) as Cli[]);
  }, [kiosco.id]);
  useEffect(() => { cargar(); }, [cargar]);

  async function abrir(id: string) {
    setMonto(""); setMsg("");
    if (abierto === id) { setAbierto(null); return; }
    setAbierto(id);
    const { data } = await supabase.from("fiado_movimientos").select("id,tipo,monto,created_at,nota").eq("cliente_id", id).order("created_at", { ascending: false }).limit(10);
    setMovs((data ?? []) as Mov[]);
  }

  async function registrar(c: Cli, tipo: "fiado" | "pago") {
    const m = num(monto);
    if (!(m > 0)) { setMsg("Poné un monto mayor a cero."); return; }
    const { error } = await supabase.from("fiado_movimientos").insert({ kiosco_id: kiosco.id, cliente_id: c.id, tipo, monto: m });
    if (error) { setMsg("No se pudo guardar."); return; }
    setMonto(""); setMsg(tipo === "fiado" ? "Anotado ✔" : "Pago registrado ✔");
    await cargar();
    const { data } = await supabase.from("fiado_movimientos").select("id,tipo,monto,created_at,nota").eq("cliente_id", c.id).order("created_at", { ascending: false }).limit(10);
    setMovs((data ?? []) as Mov[]);
  }

  async function nuevo() {
    const { error } = await supabase.from("clientes").insert({ kiosco_id: kiosco.id, nombre: nNombre.trim(), telefono: normalizarTelefonoAR(nTel) });
    if (error) { setMsg(error.code === "23505" ? "Ya tenés un cliente con ese teléfono." : "No se pudo crear el cliente."); return; }
    setNNombre(""); setNTel(""); setSoloDeuda(false); setMsg("Cliente creado ✔"); cargar();
  }

  async function borrar(c: Cli) {
    const aviso = `¿Borrar a ${c.nombre} de la libreta? Se pierden su fiado, sus sellos y su historial. Los pedidos se conservan.`;
    if (!window.confirm(aviso)) return;
    const { error } = await supabase.rpc("borrar_cliente", { p_cliente: c.id });
    if (error) { setMsg("No se pudo borrar el cliente."); return; }
    setAbierto(null); setMsg("Cliente borrado ✔");
    await cargar();
  }

  const deuda = lista.filter((c) => c.saldo > 0).reduce((s, c) => s + c.saldo, 0);
  const visibles = soloDeuda ? lista.filter((c) => c.saldo > 0) : lista;
  return (
    <>
      <div className="card" style={{ textAlign: "center" }}>
        <div className="mut">Te deben en total</div>
        <b style={{ fontSize: 28 }}>{peso(deuda)}</b>
        <div className="mut">{lista.filter((c) => c.saldo > 0).length} clientes con saldo</div>
      </div>
      <label className="mut" style={{ display: "block", margin: "8px 0" }}>
        <input type="checkbox" checked={soloDeuda} onChange={(e) => setSoloDeuda(e.target.checked)} style={{ width: "auto", marginRight: 8 }} />Mostrar solo quienes deben
      </label>
      {msg && <p role="status" className="mut">{msg}</p>}
      {visibles.length === 0 && <p className="mut">{soloDeuda ? "Nadie te debe nada. 🎉" : "Todavía no cargaste clientes."}</p>}
      {visibles.map((c) => (
        <div className="card" key={c.id}>
          <div className="row" onClick={() => abrir(c.id)} style={{ cursor: "pointer" }}>
            <b>{c.nombre}</b><b style={{ color: c.saldo > 0 ? "#c0392b" : undefined }}>{peso(c.saldo)}</b>
          </div>
          {abierto === c.id && (
            <>
              <input placeholder="Monto" value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" style={{ marginTop: 10 }} />
              <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
                <button onClick={() => registrar(c, "fiado")}>Se llevó fiado</button>
                <button className="sec" onClick={() => registrar(c, "pago")}>Pagó</button>
                <button className="sec" onClick={() => borrar(c)} style={{ color: "#c0392b" }}>Borrar cliente</button>
                {c.saldo > 0 && (
                  <a className="btn sec" href={linkWhatsApp(normalizarTelefonoAR(c.telefono),
                    `Hola ${c.nombre}! Te escribimos de ${kiosco.nombre}. Te recordamos que tenés un saldo pendiente de ${peso(c.saldo)}. Cuando puedas pasá a saldarlo. ¡Gracias!`)}>Recordar</a>
                )}
              </div>
              <ul style={{ margin: "10px 0 0", paddingLeft: 20 }} className="mut">
                {movs.map((m) => (<li key={m.id}>{new Date(m.created_at).toLocaleDateString("es-AR")} · {m.tipo === "fiado" ? "se llevó" : "pagó"} {peso(Number(m.monto))}{m.nota ? ` · ${m.nota}` : ""}</li>))}
                {movs.length === 0 && <li>Sin movimientos todavía.</li>}
              </ul>
            </>
          )}
        </div>
      ))}
      <h2>Nuevo cliente</h2>
      <input placeholder="Nombre" value={nNombre} onChange={(e) => setNNombre(e.target.value)} />
      <input placeholder="WhatsApp" value={nTel} onChange={(e) => setNTel(e.target.value)} inputMode="tel" />
      <button disabled={nNombre.trim().length < 2 || nTel.replace(/\D/g, "").length < 8} onClick={nuevo}>Agregar</button>
    </>
  );
}
