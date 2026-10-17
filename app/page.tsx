import Link from "next/link";

export default function Home() {
  return (
    <>
      <header className="afiche">
        <h1>Pedí<span className="punto">.</span> por WhatsApp</h1>
        <p>Tu kiosco con catálogo, QR y pedidos directo a tu WhatsApp. Fiado y sellos, en simple.</p>
      </header>
      <p style={{ marginTop: "1.5rem" }}>
        <Link className="btn" href="/panel">Entrar al panel</Link>
      </p>
    </>
  );
}
