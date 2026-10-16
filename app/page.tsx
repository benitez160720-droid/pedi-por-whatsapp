import Link from "next/link";

export default function Home() {
  return (
    <>
      <h1>Pedí por WhatsApp</h1>
      <p>Tu kiosco con catálogo, QR y pedidos directo a tu WhatsApp. Fiado y sellos, en simple.</p>
      <Link className="btn" href="/panel">Entrar al panel</Link>
    </>
  );
}
