import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { plata, medioLabel, listaDias, hoyStr, fechaLarga } from './comunes';

// Los PDF de "¿Qué pago?". El general es para el encargado que paga: todos los
// proveedores con sus facturas y el total. El individual va a cada proveedor para
// que sepa qué facturas se le pagan. Los dos salen solo con las facturas tildadas.

const GRIS   = [69, 72, 76];     // #45484c, el gris de las cabeceras del sistema
const SUAVE  = [107, 110, 114];  // #6b6e72
const FONDO  = [236, 235, 231];  // #ecebe7

const fechaNum = iso => {
  if (!iso) return '—';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

function encabezado(doc, titulo, bajada) {
  const ancho = doc.internal.pageSize.getWidth();
  doc.setFillColor(...GRIS);
  doc.rect(0, 0, ancho, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(titulo, 14, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(bajada, 14, 20);
  doc.text('Alfalca Holding Group', ancho - 14, 13, { align: 'right' });
  doc.text(`Emitido el ${fechaNum(hoyStr())}`, ancho - 14, 20, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  return 36;
}

function pie(doc) {
  const n = doc.getNumberOfPages();
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...SUAVE);
    doc.text(`Página ${i} de ${n}`, ancho - 14, alto - 8, { align: 'right' });
  }
}

function filasFacturas(facturas, conLocal = true) {
  return facturas.map(f => [
    f.numero || 'sin número',
    fechaNum(f.fecha),
    ...(conLocal ? [f.local_nombre || '—'] : []),
    plata(f.saldo),
  ]);
}

function tabla(doc, y, cabeza, filas, total) {
  const ult = cabeza.length - 1;
  autoTable(doc, {
    startY: y,
    head: [cabeza],
    body: filas,
    foot: [[...Array(ult).fill(''), plata(total)].map((v, i) => (i === 0 ? 'Total' : v))],
    theme: 'grid',
    margin: { left: 14, right: 14 },
    styles: { fontSize: 9, cellPadding: 2, lineColor: [210, 209, 205], lineWidth: 0.1 },
    headStyles: { fillColor: FONDO, textColor: GRIS, fontStyle: 'bold' },
    footStyles: { fillColor: FONDO, textColor: [0, 0, 0], fontStyle: 'bold' },
    columnStyles: { [ult]: { halign: 'right' } },
    didParseCell: d => { if (d.column.index === ult) d.cell.styles.halign = 'right'; },
  });
  return doc.lastAutoTable.finalY;
}

const nombreArchivo = txt => String(txt)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

// grupos: [{ proveedor, medio_pago, dias_pago, facturas: [solo las tildadas] }]
export function pdfGeneral(grupos, hasta) {
  const doc = new jsPDF();
  const alto = doc.internal.pageSize.getHeight();
  let y = encabezado(doc, 'Pagos a proveedores', `Facturas con fecha hasta el ${fechaLarga(hasta)}`);

  const total = grupos.reduce((s, g) => s + g.facturas.reduce((t, f) => t + f.saldo, 0), 0);
  const cant  = grupos.reduce((s, g) => s + g.facturas.length, 0);

  // Resumen arriba: lo que el encargado necesita para saber cuánta plata mover.
  y = tabla(
    doc, y,
    ['Proveedor', 'Forma de pago', 'Facturas', 'A pagar'],
    grupos.map(g => [
      g.proveedor, medioLabel(g.medio_pago), String(g.facturas.length),
      plata(g.facturas.reduce((t, f) => t + f.saldo, 0)),
    ]),
    total,
  ) + 10;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total a pagar: ${plata(total)}  ·  ${cant} factura${cant === 1 ? '' : 's'}`, 14, y);
  y += 10;

  // Después, el detalle proveedor por proveedor.
  for (const g of grupos) {
    if (y > alto - 40) { doc.addPage(); y = 20; }
    const sub = g.facturas.reduce((t, f) => t + f.saldo, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text(g.proveedor, 14, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...SUAVE);
    doc.text(`${medioLabel(g.medio_pago)} · cobra ${listaDias(g.dias_pago)}`, 14, y + 5);
    doc.setTextColor(0, 0, 0);
    y = tabla(doc, y + 8, ['Factura', 'Fecha', 'Local', 'Saldo'], filasFacturas(g.facturas), sub) + 10;
  }

  pie(doc);
  doc.save(`pagos-proveedores-${hoyStr()}.pdf`);
}

export function pdfProveedor(grupo) {
  const doc = new jsPDF();
  let y = encabezado(doc, 'Detalle de pago', `Proveedor: ${grupo.proveedor}`);
  const total = grupo.facturas.reduce((t, f) => t + f.saldo, 0);

  doc.setFontSize(10);
  doc.text(
    `Estas son las facturas que se le abonan a ${grupo.proveedor}, por ${medioLabel(grupo.medio_pago)}.`,
    14, y, { maxWidth: doc.internal.pageSize.getWidth() - 28 },
  );
  y += 8;

  y = tabla(doc, y, ['Factura', 'Fecha', 'Local', 'Importe'], filasFacturas(grupo.facturas), total) + 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Total: ${plata(total)}`, 14, y);

  pie(doc);
  doc.save(`pago-${nombreArchivo(grupo.proveedor)}-${hoyStr()}.pdf`);
}
