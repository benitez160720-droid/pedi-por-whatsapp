"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase, type Kiosco, type Producto } from "@/lib/supabase";
import { aportarAGlobal, buscarPorBarcode } from "@/lib/barcode";
import { peso } from "@/lib/whatsapp";
import Escaner from "./Escaner";

const num = (s: string) => Number(s.replace(",", "."));

export default function Productos({ kiosco }: { kiosco: Kiosco }) {
  const [lista, setLista] = useState<Producto[]>([]);
  const [barcode, setBarcode] = useState("");
  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState("");
  const [cat, setCat] = useState("General");
  const [fuente, setFuente] = useState<"global" | "openfoodfacts" | "kiosco">("kiosco");
  const [escaneando, setEscaneando] = useState(false);
  const [rafaga, setRafaga] = useState(true);
  const [aviso, setAviso] = useState("");
  const [buscando, setBuscando] = useState(false);

  const cargar = useCallback(async () => {
    const { data } = await supabase.from("productos").select("*").eq("kiosco_id", kiosco.id).order("categoria").order("nombre");
    setLista((data ?? []) as Producto[]);
  }, [kiosco.id]);
  useEffect(() => { cargar(); }, [cargar]);

  const limpiar = () => { setBarcode(""); setNombre(""); setPrecio(""); setFuente("kiosco"); };

  async function alLeerCodigo(raw: string) {
    const code = raw.replace(/\D/g, "");
    setEscaneando(false);
    if (!code) return;
    setBarcode(code); setAviso(""); setBuscando(true);
    const propio = lista.find((p) => p.barcode === code);
    if (propio) {
      setBuscando(false);
      setAviso(`Ya lo tenés cargado: ${propio.nombre} (${peso(Number(propio.precio))}).`);
      limpiar();
      return;
    }
    const hallado = await buscarPorBarcode(code);
    setBuscando(false);
    if (hallado) { setNombre(hallado.nombre); setFuente(hallado.fuente); setAviso(hallado.fuente === "global" ? "Lo encontramos en la base de la red. Poné el precio." : "Lo encontramos. Revisá el nombre y poné el precio."); }
    else { setNombre(""); setFuente("kiosco"); setAviso("No lo encontramos: escribí el nombre y el precio, queda guardado para la red."); }
  }

  async function guardar() {
    const { error } = await supabase.from("productos").insert({
      kiosco_id: kiosco.id, barcode: barcode || null, nombre: nombre.trim(), precio: num(precio), categoria: cat.trim() || "General",
    });
    if (error) { setAviso(error.code === "23505" ? "Ese código ya está en tu catálogo." : "No se pudo guardar, probá de nuevo."); return; }
    if (barcode) await aportarAGlobal(barcode, nombre.trim(), fuente);
    limpiar(); setAviso("Guardado ✔"); await cargar();
    if (rafaga) setEscaneando(true);
  }

  async function toggle(p: Producto) { await supabase.from("productos").update({ disponible: !p.disponible }).eq("id", p.id); cargar(); }
  async function cambiarPrecio(p: Producto) {
    const v = prompt(`Nuevo precio de ${p.nombre}`, String(p.precio));
    if (v && !isNaN(num(v)) && num(v) >= 0) { await supabase.from("productos").update({ precio: num(v) }).eq("id", p.id); cargar(); }
  }

  const puede = nombre.trim().length >= 2 && precio !== "" && num(precio) >= 0 && !buscando;
  return (
    <>
      <h2>Cargar producto</h2>
      {escaneando
        ? <Escaner onCode={alLeerCodigo} onClose={() => setEscaneando(false)} />
        : <button onClick={() => { setAviso(""); setEscaneando(true); }}>📷 Escanear código</button>}
      <label className="mut" style={{ display: "block", margin: "10px 0" }}>
        <input type="checkbox" checked={rafaga} onChange={(e) => setRafaga(e.target.checked)} style={{ width: "auto", marginRight: 8 }} />
        Seguir escaneando después de guardar
      </label>
      {aviso && <p role="status" className="mut">{aviso}</p>}
      {buscando && <p className="mut">Buscando…</p>}
      <input placeholder="Código de barras (opcional)" value={barcode} onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ""))} inputMode="numeric" />
      <input placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <input placeholder="Precio" value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="decimal" />
      <input placeholder="Categoría" value={cat} onChange={(e) => setCat(e.target.value)} />
      <button disabled={!puede} onClick={guardar}>Guardar</button>

      <h2>Catálogo ({lista.length})</h2>
      {lista.map((p) => (
        <div className="card row" key={p.id}>
          <div><div>{p.nombre}</div><span className="mut">{p.categoria}</span></div>
          <div className="qty">
            <button className="sec" onClick={() => cambiarPrecio(p)}>{peso(Number(p.precio))}</button>
            <button className={p.disponible ? "" : "sec"} onClick={() => toggle(p)}>{p.disponible ? "Hay" : "Sin stock"}</button>
          </div>
        </div>
      ))}
    </>
  );
}
