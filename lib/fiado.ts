// Aviso semanal de fiado vencido (lo manda el cron, solo al dueño; nunca a los clientes).
export function armarAvisoFiado(a: { clientes: number; monto: number; dias: number }) {
  const plata = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Math.round(a.monto));
  return {
    title: "Fiado para cobrar",
    body: `${a.clientes} cliente${a.clientes > 1 ? "s" : ""} debe${a.clientes > 1 ? "n" : ""} $${plata} hace más de ${a.dias} días`,
    url: "/panel?tab=fiado",
  };
}

// Aviso semanal de clientes que dejaron de venir (lo manda el cron, solo al dueño). Va a Radar.
export function armarAvisoFuga(a: { clientes: number; dias: number }) {
  return {
    title: "Clientes que dejaron de venir",
    body: `${a.clientes} cliente${a.clientes > 1 ? "s" : ""} no compra${a.clientes > 1 ? "n" : ""} hace más de ${a.dias} días`,
    url: "/panel?tab=radar",
  };
}
