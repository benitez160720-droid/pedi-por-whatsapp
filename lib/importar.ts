import { esCodigoValido } from "./ean";

export type FilaImport = { nombre: string; precio: number; categoria: string; barcode: string | null };
export type ResultadoPlanilla = { filas: FilaImport[]; errores: { linea: number; texto: string; motivo: string }[]; duplicados: number };

export const MAX_FILAS = 500;
export const normNombre = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
export const capitalizar = (s: string) => { const t = s.trim().replace(/\s+/g, " "); return t ? t[0].toUpperCase() + t.slice(1) : t; };

/** Precio en formato argentino: "2.485", "2485,50", "$ 1.250,5", "12.5". Devuelve null si no es un número válido. */
export function parsePrecio(raw: string): number | null {
  let s = raw.replace(/[$\s]/g, "");
  if (!s || !/^[\d.,]+$/.test(s)) return null;
  const punto = s.includes("."), coma = s.includes(",");
  if (punto && coma) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (coma) s = s.replace(",", ".");
  else if (punto && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n < 1e8 ? n : null;
}

/** Columnas: nombre ; precio ; categoría (opcional) ; código de barras (opcional). Separador: tab (Excel), ";" o ",". */
export function parsePlanilla(texto: string, nombres: Set<string>, barcodes: Set<string>): ResultadoPlanilla {
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: ResultadoPlanilla = { filas: [], errores: [], duplicados: 0 };
  const vistosN = new Set(nombres), vistosB = new Set(barcodes);
  let excedido = false;
  lineas.forEach((l, i) => {
    if (excedido) return;
    if (out.filas.length >= MAX_FILAS) { excedido = true; return; }
    const delim = l.includes("\t") ? "\t" : l.includes(";") ? ";" : ",";
    const c = l.split(delim).map((x) => x.trim());
    if (i === 0 && /^(nombre|producto|descripci|art)/i.test(c[0]) && parsePrecio(c[1] ?? "") === null) return; // encabezado
    const nombre = capitalizar(c[0] ?? "");
    const precio = parsePrecio(c[1] ?? "");
    if (nombre.length < 2) { out.errores.push({ linea: i + 1, texto: l, motivo: "falta el nombre" }); return; }
    if (precio === null) { out.errores.push({ linea: i + 1, texto: l, motivo: "precio inválido" }); return; }
    const cod = (c[3] ?? "").replace(/\D/g, "");
    const barcode = esCodigoValido(cod) ? cod : null;
    const nn = normNombre(nombre);
    if ((barcode && vistosB.has(barcode)) || vistosN.has(nn)) { out.duplicados++; return; }
    vistosN.add(nn); if (barcode) vistosB.add(barcode);
    out.filas.push({ nombre, precio, categoria: capitalizar(c[2] ?? "") || "General", barcode });
  });
  if (excedido) out.errores.push({ linea: 0, texto: "", motivo: `se importan hasta ${MAX_FILAS} productos por vez; cargá el resto en otra tanda` });
  return out;
}
