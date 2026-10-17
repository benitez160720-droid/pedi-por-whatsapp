import Link from "next/link";
import AyudaWhatsApp from "@/components/AyudaWhatsApp";

const PASOS = [
  { n: "1", t: "Cargás tus productos", d: "Con nombre, precio y foto. Si ya tenés una lista, la subís de una vez." },
  { n: "2", t: "Pegás el QR en el local", d: "Tus clientes lo escanean con el celular y ven tu tienda, sin instalar nada." },
  { n: "3", t: "Recibís los pedidos en WhatsApp", d: "Te llega el pedido armado. Confirmás con un toque y listo." },
];
const INCLUYE = [
  ["Tienda propia", "Tus productos y precios, siempre al día."],
  ["Caja para el mostrador", "Cobrá, hacé el cierre del día y llevá la plata ordenada."],
  ["Fiado", "Anotá quién te debe y cuánto, y recordáselo por WhatsApp."],
  ["Puntos y premios", "Tus clientes suman puntos con cada compra y vuelven."],
];

export default function Home() {
  return (
    <>
      <header className="afiche portada">
        <h1>Tu kiosco en WhatsApp<span className="punto">.</span></h1>
        <p>Tus clientes piden desde el celular y vos recibís el pedido listo en tu WhatsApp.</p>
        <p style={{ marginTop: "1.25rem" }}>
          <Link className="btn btn-grande" href="/panel">Entrar a mi kiosco</Link>
        </p>
      </header>

      <section className="portada-sec" aria-labelledby="como">
        <h2 id="como">Cómo funciona</h2>
        <ol className="pasos">
          {PASOS.map((p) => (
            <li key={p.n} className="card paso">
              <span className="paso-n" aria-hidden="true">{p.n}</span>
              <div><b>{p.t}</b><p className="mut">{p.d}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <section className="portada-sec" aria-labelledby="incluye">
        <h2 id="incluye">Todo lo que necesitás, en un solo lugar</h2>
        <ul className="incluye">
          {INCLUYE.map(([t, d]) => (
            <li key={t}><b>{t}</b><span className="mut">{d}</span></li>
          ))}
        </ul>
      </section>

      <section className="portada-cierre">
        <Link className="btn btn-grande" href="/panel">Entrar a mi kiosco</Link>
        <AyudaWhatsApp />
      </section>
    </>
  );
}
