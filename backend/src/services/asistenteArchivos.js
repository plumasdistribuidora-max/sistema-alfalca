// El Excel y el PDF de una respuesta de Claudia, armados con la tabla que pasó con armar_tabla
// (services/asistente.js). Los arma el sistema: no gastan créditos de Claude.

const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');

const GRIS = '#55585c', TINTA = '#1f2022', SUAVE = '#6b6e72', LINEA = '#dcdbd6', FONDO = '#ecebe7';

const fecha = d => new Date(d).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Mendoza' });
const primerNombre = n => String(n || '').replace(/\(.*?\)/g, '').trim().split(/\s+/)[0] || '';

function nombreArchivo(titulo, ext) {
  const limpio = String(titulo || 'Respuesta').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return `Claudia - ${limpio}.${ext}`;
}

function formatear(v, tipo) {
  if (v == null || v === '') return '';
  if (tipo === 'texto') return String(v);
  const n = Number(v);
  if (tipo === 'pesos') return `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
  if (tipo === 'decimal') return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (tipo === 'porcentaje') return `${n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
  return n.toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

const FORMATO_EXCEL = { numero: '#,##0', decimal: '#,##0.00', pesos: '"$ "#,##0', porcentaje: '0.0%' };

// ── Excel ────────────────────────────────────────────────────────────────────

function excel(p) {
  const t = p.tabla;
  const wb = XLSX.utils.book_new();
  const usados = new Set();

  for (const h of t.hojas) {
    const aoa = [[t.titulo], [`Preguntado por ${primerNombre(p.nombre)} a Claudia el ${fecha(p.creado_en)}`], [],
      h.columnas.map(c => c.nombre)];
    const aExcel = (v, c) => (c.tipo === 'porcentaje' && typeof v === 'number' ? v / 100 : v ?? '');
    for (const f of h.filas) aoa.push(f.map((v, i) => aExcel(v, h.columnas[i])));
    if (h.total) aoa.push(h.total.map((v, i) => aExcel(v, h.columnas[i])));
    const hoja = XLSX.utils.aoa_to_sheet(aoa);

    for (let r = 4; r < aoa.length; r++) {
      h.columnas.forEach((c, i) => {
        const celda = hoja[XLSX.utils.encode_cell({ r, c: i })];
        if (celda && typeof celda.v === 'number' && FORMATO_EXCEL[c.tipo]) celda.z = FORMATO_EXCEL[c.tipo];
      });
    }
    hoja['!cols'] = h.columnas.map((c, i) => ({
      wch: Math.min(50, Math.max(c.nombre.length, ...h.filas.map(f => formatear(f[i], c.tipo).length)) + 2),
    }));
    if (h.filas.length) hoja['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: 3 + h.filas.length, c: h.columnas.length - 1 } }) };

    let nombre = h.nombre.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Hoja';
    for (let i = 2; usados.has(nombre); i++) nombre = `${nombre.slice(0, 28)} ${i}`;
    usados.add(nombre);
    XLSX.utils.book_append_sheet(wb, hoja, nombre);
  }

  const consultas = (p.consultas || []).filter(c => !c.error && c.para_que);
  const fuente = XLSX.utils.aoa_to_sheet([
    ['La pregunta'], [p.pregunta], [],
    ['De dónde sale'], [t.fuente || ''], [],
    ...(consultas.length ? [['Consultas que hizo Claudia'], ...consultas.map((c, i) => [`${i + 1}. ${c.para_que}`])] : []),
  ]);
  fuente['!cols'] = [{ wch: 120 }];
  XLSX.utils.book_append_sheet(wb, fuente, usados.has('De dónde sale') ? 'Fuente' : 'De dónde sale');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ── PDF ──────────────────────────────────────────────────────────────────────

// Las fuentes de base del PDF no tienen emojis ni símbolos raros: se sacan para que no salgan garabatos.
const apto = s => String(s ?? '').replace(/[^\u0000-ÿ–—‘’“”•…€]/g, '');

function pdf(p) {
  const t = p.tabla;
  const ancha = t.hojas.some(h => h.columnas.length > 6);
  const doc = new PDFDocument({ size: 'A4', layout: ancha ? 'landscape' : 'portrait', margin: 48, bufferPages: true });
  const partes = [];
  doc.on('data', b => partes.push(b));
  const listo = new Promise(ok => doc.on('end', () => ok(Buffer.concat(partes))));

  const X = 48;
  const W = doc.page.width - 96;
  const BAJO = doc.page.height - 60;

  doc.rect(0, 0, doc.page.width, 70).fill(GRIS);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(16).text('alfalca', X, 22);
  doc.font('Helvetica').fontSize(9).fillColor('#d6d6d3')
    .text(`Respuesta de Claudia · pedida por ${apto(primerNombre(p.nombre))} el ${fecha(p.creado_en)}`, X, 42);

  doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(18).text(apto(t.titulo), X, 96, { width: W });
  doc.moveDown(0.4).font('Helvetica').fontSize(10.5).fillColor(SUAVE).text(apto(p.pregunta), { width: W });

  if (t.destacados.length) {
    doc.moveDown(1);
    const y0 = doc.y;
    const ancho = W / t.destacados.length;
    t.destacados.forEach((d, i) => {
      const x = X + i * ancho;
      doc.roundedRect(x, y0, ancho - 8, 52, 6).fill(i === 0 ? GRIS : FONDO);
      doc.fillColor(i === 0 ? '#d6d6d3' : SUAVE).font('Helvetica').fontSize(8).text(apto(d.etiqueta).toUpperCase(), x + 10, y0 + 10, { width: ancho - 28, lineBreak: false });
      doc.fillColor(i === 0 ? '#fff' : TINTA).font('Helvetica-Bold').fontSize(14).text(apto(d.valor), x + 10, y0 + 24, { width: ancho - 28, lineBreak: false, ellipsis: true });
    });
    doc.y = y0 + 66;
  }
  if (t.conclusion) {
    doc.moveDown(0.6).fillColor(TINTA).font('Helvetica').fontSize(10.5).text(apto(t.conclusion), X, doc.y, { width: W, lineGap: 2 });
  }

  for (const h of t.hojas) {
    // Las columnas de texto se reparten lo que sobra; las de números van angostas.
    const numericas = h.columnas.filter(c => c.tipo !== 'texto').length;
    const anchoNum = Math.min(85, (W * 0.6) / Math.max(numericas, 1));
    const textos = h.columnas.length - numericas;
    const anchoTexto = textos ? (W - anchoNum * numericas) / textos : 0;
    const anchos = h.columnas.map(c => (c.tipo === 'texto' ? anchoTexto : anchoNum + (textos ? 0 : (W - anchoNum * numericas) / numericas)));
    const letra = h.columnas.length > 7 ? 8 : 9.5;

    const fila = (vals, { bold = false, fondo = null, color = TINTA } = {}) => {
      const alto = Math.max(...vals.map((v, i) => doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(letra)
        .heightOfString(apto(v), { width: anchos[i] - 8 }))) + 6;
      const y = doc.y;
      if (fondo) doc.rect(X, y - 3, W, alto).fill(fondo);
      let x = X;
      vals.forEach((v, i) => {
        doc.fillColor(color).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(letra)
          .text(apto(v), x + 4, y, { width: anchos[i] - 8, align: h.columnas[i].tipo === 'texto' ? 'left' : 'right' });
        x += anchos[i];
      });
      doc.y = y + alto;
      doc.moveTo(X, doc.y - 3).lineTo(X + W, doc.y - 3).lineWidth(0.5).strokeColor(LINEA).stroke();
    };
    const encabezado = () => fila(h.columnas.map(c => c.nombre), { bold: true, fondo: FONDO, color: SUAVE });

    if (doc.y > BAJO - 80) doc.addPage();
    doc.moveDown(1.2).fillColor(TINTA).font('Helvetica-Bold').fontSize(12).text(apto(h.nombre), X, doc.y);
    doc.moveDown(0.5);
    encabezado();
    for (const f of h.filas) {
      if (doc.y > BAJO) { doc.addPage(); doc.y = 48; encabezado(); }
      fila(f.map((v, i) => formatear(v, h.columnas[i].tipo)));
    }
    if (h.total) {
      if (doc.y > BAJO) { doc.addPage(); doc.y = 48; }
      fila(h.total.map((v, i) => formatear(v, h.columnas[i].tipo)), { bold: true, fondo: FONDO });
    }
  }

  if (t.fuente) {
    if (doc.y > BAJO - 40) { doc.addPage(); doc.y = 48; }
    doc.moveDown(1.2).font('Helvetica-Bold').fontSize(9).fillColor(SUAVE).text('De dónde sale', X, doc.y);
    doc.font('Helvetica').fontSize(8.5).text(apto(t.fuente), { width: W, lineGap: 1.5 });
  }

  const paginas = doc.bufferedPageRange().count;
  if (paginas > 1) {
    for (let i = 0; i < paginas; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;   // si no, escribir debajo del margen abre otra página
      doc.font('Helvetica').fontSize(8).fillColor(SUAVE)
        .text(`${i + 1} de ${paginas}`, X, doc.page.height - 36, { width: W, align: 'right', lineBreak: false });
    }
  }
  doc.end();
  return listo;
}

module.exports = { excel, pdf, nombreArchivo };
