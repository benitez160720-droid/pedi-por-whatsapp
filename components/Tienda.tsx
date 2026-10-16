"use client";
import { useMemo, useState } from "react";
import { supabase, type Kiosco, type Producto } from "@/lib/supabase";
import { linkWhatsApp, mensajePedido, normalizarTelefonoAR, peso } from "@/lib/whatsapp";

export default function Tienda({ kiosco, productos }: { kiosco: Kiosco; productos: Producto[] }) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [paso, setPaso] = useState<"catalogo" | "datos">("catalogo");
  const [nombre, setNombre] = useState("");
  const [tel, setTel] = useState("");
  const [modalidad, setModalidad] = useState<"retiro" | "envio">("retiro");
  const [dir, setDir] = useState("");
  const [notas, setNotas] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const items = useMemo(() => productos.filter((p) => cart[p.id]).map((p) => ({ p, cant: cart[p.id] })), [cart, productos]);
  const total = items.reduce((s, i) => s + Number(i.p.precio) * i.cant, 0);
  const cantTotal = items.reduce((s, i) => s + i.cant, 0);
  const porCategoria = useMemo(() => {
    const m = new Map<string, Producto[]>();
    productos.forEach((p) => m.set(p.categoria, [...(m.get(p.categoria) ?? []), p]));
    return [...m.entries()];
  }, [productos]);

  const cambiar = (id: string, d: number) =>
    setCart((c) => { const n = Math.max(0, (c[id] ?? 0) + d); const x = { ...c }; if (n) x[id] = n; else delete x[id]; return x; });

  async function enviar() {
    setError(""); setEnviando(true);
    const { data, error: err } = await supabase.rpc("crear_pedido", {
      p_slug: kiosco.slug, p_nombre: nombre, p_telefono: tel, p_modalidad: modalidad,
      p_direccion: dir, p_notas: notas, p_items: items.map((i) => ({ producto_id: i.p.id, cantidad: i.cant })),
    });
    setEnviando(false);
    if (err) { setError("No pudimos registrar el pedido. Revisá los datos e intentá de nuevo."); return; }
    const texto = mensajePedido({
      nombre, telefono: tel, modalidad, direccion: dir, notas,
      items: items.map((i) => ({ nombre: i.p.nombre, cantidad: i.cant, precio: Number(i.p.precio) })),
      total: Number(data.total),
    });
    window.location.href = linkWhatsApp(normalizarTelefonoAR(kiosco.whatsapp), texto);
  }

  if (paso === "datos") {
    const ok = nombre.trim().length >= 2 && tel.replace(/\D/g, "").length >= 8 && (modalidad === "retiro" || dir.trim().length >= 3);
    return (
      <>
        <button className="sec" onClick={() => setPaso("catalogo")}>← Volver</button>
        <h1>Tu pedido</h1>
        {items.map(({ p, cant }) => (<div className="row" key={p.id}><span>{cant} x {p.nombre}</span><b>{peso(Number(p.precio) * cant)}</b></div>))}
        <h2>Total {peso(total)}</h2>
        <label>Nombre<input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" /></label>
        <label>Tu WhatsApp<input value={tel} onChange={(e) => setTel(e.target.value)} inputMode="tel" autoComplete="tel" /></label>
        <label>¿Cómo lo querés?
          <select value={modalidad} onChange={(e) => setModalidad(e.target.value as "retiro" | "envio")}>
            <option value="retiro">Retiro en el local</option>
            {kiosco.acepta_envio && <option value="envio">Envío</option>}
          </select>
        </label>
        {modalidad === "envio" && <label>Dirección<input value={dir} onChange={(e) => setDir(e.target.value)} autoComplete="street-address" /></label>}
        <label>Nota (opcional)<textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} /></label>
        {error && <p role="alert" style={{ color: "#c0392b" }}>{error}</p>}
        <button disabled={!ok || enviando} onClick={enviar}>{enviando ? "Enviando…" : "Enviar pedido por WhatsApp"}</button>
      </>
    );
  }

  return (
    <>
      <h1>{kiosco.nombre}</h1>
      {kiosco.direccion && <p className="mut">{kiosco.direccion}</p>}
      {productos.length === 0 && <p className="mut">Este kiosco todavía no cargó productos.</p>}
      {porCategoria.map(([cat, ps]) => (
        <section key={cat}>
          <h2>{cat}</h2>
          {ps.map((p) => (
            <div className="card row" key={p.id}>
              <div><div>{p.nombre}</div><b>{peso(Number(p.precio))}</b></div>
              <div className="qty">
                {cart[p.id] ? (<><button className="sec" onClick={() => cambiar(p.id, -1)} aria-label="Quitar uno">−</button><span>{cart[p.id]}</span></>) : null}
                <button onClick={() => cambiar(p.id, 1)} aria-label={`Agregar ${p.nombre}`}>+</button>
              </div>
            </div>
          ))}
        </section>
      ))}
      {cantTotal > 0 && (
        <div className="bar"><div><button style={{ width: "100%" }} onClick={() => setPaso("datos")}>Ver pedido ({cantTotal}) · {peso(total)}</button></div></div>
      )}
    </>
  );
}
