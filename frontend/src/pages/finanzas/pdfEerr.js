import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fmtARS, fmtPct } from '../red/redUtils';

// El PDF del estado de resultados de un local en un mes. Arriba, la banda gris con el
// isotipo y cuatro tarjetas con los números clave; debajo, la misma tabla de la pantalla.

const GRIS  = [69, 72, 76];      // #45484c
const SUAVE = [107, 110, 114];   // #6b6e72
const CLARO = [168, 162, 158];
const FONDO = [244, 244, 242];   // tarjetas y filas de subtotal
const COBRE = [176, 111, 45];    // el resultado neto
const LINEA = [220, 219, 214];
const TINTA = [28, 25, 23];

const plata = v => fmtARS(Math.round(Number(v) || 0));
const pctDe = (v, base) => fmtPct(base > 0 ? Math.round(v / base * 1000) / 10 : 0);
const hoy = () => new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const archivo = txt => String(txt)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const textoDe = f => (typeof f.label === 'string' ? f.label : (f.texto || ''));

// El isotipo de cuatro piezas (components/Marca.jsx), dibujado en un cuadrado de lado s.
function isotipo(doc, x, y, s, color) {
  const k = s / 100;
  doc.setFillColor(...color);
  doc.lines([[0, -25.96 * k, 21.04 * k, -47 * k, 47 * k, -47 * k], [0, 47 * k]], x, y + 47 * k, [1, 1], 'F', true);
  doc.triangle(x + 53 * k, y, x + 53 * k, y + 47 * k, x + 100 * k, y + 47 * k, 'F');
  doc.rect(x, y + 53 * k, 47 * k, 47 * k, 'F');
  doc.lines([
    [47 * k, 0],
    [0, 12.98 * k, -10.52 * k, 23.5 * k, -23.5 * k, 23.5 * k],
    [-12.98 * k, 0, -23.5 * k, -10.52 * k, -23.5 * k, -23.5 * k],
  ], x + 53 * k, y + 53 * k, [1, 1], 'F', true);
}

// filas: las mismas de EstadoResultados. Si el label no es texto (lleva una marca de color),
// la fila trae su versión en texto en `texto`.
export function pdfEerr({ filas, ventaNeta, local, mesLabel, aviso }) {
  const doc = new jsPDF();
  const ancho = doc.internal.pageSize.getWidth();

  // ── Banda de arriba ──
  doc.setFillColor(...GRIS);
  doc.rect(0, 0, ancho, 34, 'F');
  isotipo(doc, 14, 9, 16, [255, 255, 255]);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('Estado de resultados', 36, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(215, 214, 210);
  doc.text(`${local}  ·  ${mesLabel}`, 36, 23);
  doc.setFontSize(8);
  doc.text('Alfalca Holding Group', ancho - 14, 16, { align: 'right' });
  doc.text(`Emitido el ${hoy()}`, ancho - 14, 23, { align: 'right' });

  // ── Cuatro tarjetas: venta neta, margen bruto, EBITDA y resultado neto ──
  const buscar = label => filas.find(f => textoDe(f) === label);
  const tarjetas = ['Venta neta', 'Margen bruto', 'EBITDA', 'Resultado neto'].map(l => [l, buscar(l)]);
  const gap = 4, bw = (ancho - 28 - gap * 3) / 4, by = 42;
  tarjetas.forEach(([label, f], i) => {
    const x = 14 + i * (bw + gap);
    const fuerte = i === 3;
    const vacio = !f || f.incompleto || f.sinCargar;
    doc.setFillColor(...(fuerte ? COBRE : FONDO));
    doc.roundedRect(x, by, bw, 22, 2, 2, 'F');
    doc.setTextColor(...(fuerte ? [255, 255, 255] : SUAVE));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(label.toUpperCase(), x + 4, by + 6);
    doc.setTextColor(...(fuerte ? [255, 255, 255] : TINTA));
    doc.setFontSize(vacio ? 10 : 12.5);
    doc.text(vacio ? 'Incompleto' : plata(f.actual), x + 4, by + 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...(fuerte ? [250, 235, 220] : CLARO));
    if (!vacio) doc.text(`${pctDe(f.actual, ventaNeta)} de la venta`, x + 4, by + 19);
  });

  let y = by + 30;
  if (aviso) {
    doc.setTextColor(...SUAVE);
    doc.setFontSize(8);
    doc.text(aviso, 14, y, { maxWidth: ancho - 28 });
    y += 7;
  }

  // ── La tabla ──
  const body = filas.map(f => {
    const vacio = f.sinCargar ? 'Sin cargar' : f.incompleto ? 'Incompleto' : null;
    // Guion común: la fuente del PDF no tiene el signo menos tipográfico.
    const monto = vacio || (f.costo && f.actual ? `- ${plata(f.actual)}` : plata(f.actual));
    const pct = vacio ? '' : pctDe(f.actual, ventaNeta);
    return { tipo: f.tipo, celdas: [f.tipo === 'det' ? `      ${textoDe(f)}` : textoDe(f), monto, pct] };
  });

  autoTable(doc, {
    startY: y,
    head: [['', mesLabel, '% venta']],
    body: body.map(b => b.celdas),
    theme: 'plain',
    margin: { left: 14, right: 14, bottom: 18 },
    styles: { fontSize: 9.2, cellPadding: { top: 1.45, bottom: 1.45, left: 2, right: 2 }, textColor: TINTA },
    headStyles: { textColor: SUAVE, fontStyle: 'bold', fontSize: 7.5 },
    columnStyles: { 1: { halign: 'right', cellWidth: 42 }, 2: { halign: 'right', cellWidth: 22 } },
    didParseCell: d => {
      if (d.section === 'head') { if (d.column.index > 0) d.cell.styles.halign = 'right'; return; }
      const tipo = body[d.row.index].tipo;
      if (tipo === 'det') { d.cell.styles.textColor = SUAVE; d.cell.styles.fontSize = 8.6; }
      if (tipo === 'grp') { d.cell.styles.fontStyle = 'bold'; }
      if (tipo === 'sub') { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = FONDO; }
      if (tipo === 'fin') {
        d.cell.styles.fontStyle = 'bold'; d.cell.styles.fontSize = 10.5;
        d.cell.styles.fillColor = GRIS; d.cell.styles.textColor = [255, 255, 255];
      }
      if (d.column.index === 2 && tipo !== 'fin') d.cell.styles.textColor = CLARO;
    },
    didDrawCell: d => {
      // Se dibuja con la última columna, cuando el fondo de toda la fila ya está pintado.
      if (d.section === 'body' && body[d.row.index].tipo === 'sub' && d.column.index === 2) {
        doc.setDrawColor(40, 40, 40);
        doc.setLineWidth(0.3);
        doc.line(14, d.cell.y, ancho - 14, d.cell.y);
      }
    },
  });

  // ── Pie de cada hoja ──
  const alto = doc.internal.pageSize.getHeight();
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINEA);
    doc.setLineWidth(0.2);
    doc.line(14, alto - 13, ancho - 14, alto - 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...CLARO);
    doc.text('Alfalca Holding Group · Estado de resultados generado desde el sistema', 14, alto - 8);
    doc.text(`Página ${i} de ${n}`, ancho - 14, alto - 8, { align: 'right' });
  }
  doc.save(`eerr-${archivo(local)}-${archivo(mesLabel)}.pdf`);
}
