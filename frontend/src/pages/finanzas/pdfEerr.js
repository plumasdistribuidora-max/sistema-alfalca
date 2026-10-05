import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fmtARS, fmtPct } from '../red/redUtils';

// El PDF del estado de resultados de un local en un mes: la misma tabla que se ve en
// pantalla, con el mismo encabezado gris que los PDF de proveedores.

const GRIS  = [69, 72, 76];      // #45484c
const SUAVE = [107, 110, 114];   // #6b6e72
const FONDO = [244, 244, 242];   // las filas de subtotal

const plata = v => fmtARS(Math.round(Number(v) || 0));
const hoy = () => new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const archivo = txt => String(txt)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

// filas: las mismas de EstadoResultados. Si el label no es texto (lleva una marca de color),
// la fila trae su versión en texto en `texto`.
export function pdfEerr({ filas, ventaNeta, local, mesLabel, aviso }) {
  const doc = new jsPDF();
  const ancho = doc.internal.pageSize.getWidth();

  doc.setFillColor(...GRIS);
  doc.rect(0, 0, ancho, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Estado de resultados', 14, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`${local} · ${mesLabel}`, 14, 20);
  doc.text('Alfalca Holding Group', ancho - 14, 13, { align: 'right' });
  doc.text(`Emitido el ${hoy()}`, ancho - 14, 20, { align: 'right' });

  let y = 34;
  if (aviso) {
    doc.setTextColor(...SUAVE);
    doc.setFontSize(8.5);
    doc.text(aviso, 14, y, { maxWidth: ancho - 28 });
    y += 8;
  }

  const body = filas.map(f => {
    const vacio = f.sinCargar ? 'Sin cargar' : f.incompleto ? 'Incompleto' : null;
    // Guion común: la fuente del PDF no tiene el signo menos tipográfico.
    const monto = vacio || (f.costo && f.actual ? `- ${plata(f.actual)}` : plata(f.actual));
    const pct = vacio ? '' : fmtPct(ventaNeta > 0 ? Math.round(f.actual / ventaNeta * 1000) / 10 : 0);
    const label = typeof f.label === 'string' ? f.label : (f.texto || '');
    return { tipo: f.tipo, celdas: [f.tipo === 'det' ? `    ${label}` : label, monto, pct] };
  });

  autoTable(doc, {
    startY: y,
    head: [['', mesLabel, '% venta']],
    body: body.map(b => b.celdas),
    theme: 'plain',
    margin: { left: 14, right: 14 },
    styles: { fontSize: 9.5, cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 } },
    headStyles: { textColor: SUAVE, fontStyle: 'bold', fontSize: 8 },
    columnStyles: { 1: { halign: 'right', cellWidth: 45 }, 2: { halign: 'right', cellWidth: 25 } },
    didParseCell: d => {
      if (d.section === 'head') { if (d.column.index > 0) d.cell.styles.halign = 'right'; return; }
      const tipo = body[d.row.index].tipo;
      if (tipo === 'det') { d.cell.styles.textColor = SUAVE; d.cell.styles.fontSize = 9; }
      if (tipo === 'grp') { d.cell.styles.fontStyle = 'bold'; }
      if (tipo === 'sub') { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = FONDO; }
      if (tipo === 'fin') { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = GRIS; d.cell.styles.textColor = [255, 255, 255]; }
      if (d.column.index === 2 && tipo !== 'fin') d.cell.styles.textColor = [168, 162, 158];
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

  const alto = doc.internal.pageSize.getHeight();
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...SUAVE);
    doc.text(`Página ${i} de ${n}`, ancho - 14, alto - 8, { align: 'right' });
  }
  doc.save(`eerr-${archivo(local)}-${archivo(mesLabel)}.pdf`);
}
