"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function QrKiosco({ slug, nombre }: { slug: string; nombre: string }) {
  const [png, setPng] = useState("");
  const url = typeof window !== "undefined" ? `${location.origin}/${slug}` : "";

  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: "M" }).then(setPng);
  }, [url]);

  if (!png) return null;
  return (
    <div className="card">
      <div className="row">
        <img src={png} alt={`QR de ${nombre}`} width={120} height={120} />
        <div>
          <p className="mut" style={{ margin: 0 }}>Pegalo en la vidriera, el mostrador y las bolsas.</p>
          <a className="btn" download={`qr-${slug}.png`} href={png} style={{ marginTop: 8 }}>Descargar QR</a>
        </div>
      </div>
      <p className="mut" style={{ wordBreak: "break-all" }}>{url}</p>
    </div>
  );
}
