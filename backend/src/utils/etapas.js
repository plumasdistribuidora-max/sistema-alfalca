// Reportes en dos etapas (el de barista): lo que se carga al RECIBIR el turno se
// confirma una vez y queda fijo; lo que se carga al ENTREGAR se envía al final.
//
// Un campo pertenece a la apertura si la plantilla le pone "etapa":"apertura". El
// tipo pesaje_cafe agrupa la bolsa abierta y las bolsas cerradas con sus fotos, y con
// "con_previa" ofrece confirmar el pesaje que dejó el turno anterior.
const pool = require('../config/db');

const esApertura = campo => campo.etapa === 'apertura';
const camposApertura = campos => campos.filter(esApertura);
const tieneApertura  = campos => campos.some(esApertura);

// Fijo durante el turno; si el encargado lo devolvió, se puede corregir entero.
const aperturaBloqueada = reporte => !!reporte.apertura_at && reporte.estado === 'borrador';

// Las fotos de un pesaje viven en adjuntos con estos códigos.
const fotosPesaje = codigo => ({ abierta: `${codigo}__abierta`, cerradas: `${codigo}__cerradas` });

// Todos los códigos de adjunto que pertenecen a la apertura (campos foto y fotos de pesaje).
function codigosFotoApertura(campos) {
  const out = [];
  for (const c of camposApertura(campos)) {
    if (c.tipo === 'foto') out.push(c.codigo);
    if (c.tipo === 'pesaje_cafe') out.push(...Object.values(fotosPesaje(c.codigo)));
  }
  return out;
}

const num = v => (v === '' || v === null || v === undefined || isNaN(Number(v))) ? null : Number(v);

function valorPesaje(v) {
  const o = v && typeof v === 'object' ? v : {};
  return {
    abierta_kg:  num(o.abierta_kg),
    cerradas_kg: num(o.cerradas_kg),
    coincide:    typeof o.coincide === 'boolean' ? o.coincide : null,
    previa_reporte_id: o.previa_reporte_id ? Number(o.previa_reporte_id) : null,
    previa_nombre: o.previa_nombre || null,
  };
}

function totalPesaje(v) {
  const p = valorPesaje(v);
  if (p.abierta_kg === null || p.cerradas_kg === null) return null;
  return Math.round((p.abierta_kg + p.cerradas_kg) * 100) / 100;
}

// Qué falta en un pesaje: los dos números, y las fotos salvo que se haya confirmado
// el pesaje del turno anterior (la foto está en ese reporte).
function faltantesPesaje(campo, valor, adjuntos) {
  const faltan = [];
  const p = valorPesaje(valor);
  if (!campo.requerido) return faltan;
  if (p.abierta_kg === null)  faltan.push(`${campo.label} — kilos en la bolsa abierta`);
  if (p.cerradas_kg === null) faltan.push(`${campo.label} — kilos en bolsas cerradas`);
  const confirmoPrevia = campo.con_previa && p.coincide === true && p.previa_reporte_id;
  if (!confirmoPrevia) {
    const f = fotosPesaje(campo.codigo);
    if (!adjuntos.some(a => a.campo_codigo === f.abierta))  faltan.push(`${campo.label} — foto de la balanza con la bolsa abierta`);
    if (!adjuntos.some(a => a.campo_codigo === f.cerradas)) faltan.push(`${campo.label} — foto de las bolsas cerradas`);
  }
  return faltan;
}

// La última entrega de turno en ese local con esta plantilla: lo que pesó quien se
// fue, para que quien llega lo confirme. Puede ser de hoy (cambio de turno) o de la
// noche anterior (la primera del día recibe lo que dejó la última).
async function entregaPrevia(campos, localId, plantillaCodigo, fecha, excluirReporteId) {
  const campoEntrega = campos.find(c => c.tipo === 'pesaje_cafe' && !esApertura(c));
  if (!campoEntrega) return null;
  const { rows } = await pool.query(`
    SELECT r.id, r.fecha::text AS fecha, r.turno, r.enviado_at, r.respuestas,
           u.nombre AS usuario_nombre
    FROM reportes r JOIN usuarios u ON u.id = r.usuario_id
    WHERE r.local_id = $1 AND r.plantilla_codigo = $2 AND r.fecha <= $3
      AND r.estado IN ('enviado', 'aprobado') AND r.id <> $4
      AND r.respuestas ? $5
    ORDER BY r.fecha DESC, r.enviado_at DESC
    LIMIT 1
  `, [localId, plantillaCodigo, fecha, excluirReporteId || 0, campoEntrega.codigo]);
  if (!rows.length) return null;
  const r = rows[0];
  const p = valorPesaje(r.respuestas[campoEntrega.codigo]);
  if (p.abierta_kg === null || p.cerradas_kg === null) return null;
  const f = fotosPesaje(campoEntrega.codigo);
  const adjuntos = (await pool.query(
    'SELECT id, campo_codigo FROM reporte_adjuntos WHERE reporte_id = $1 AND campo_codigo = ANY($2) ORDER BY id',
    [r.id, Object.values(f)]
  )).rows;
  return {
    reporte_id: r.id, usuario_nombre: r.usuario_nombre, fecha: r.fecha, turno: r.turno,
    enviado_at: r.enviado_at,
    abierta_kg: p.abierta_kg, cerradas_kg: p.cerradas_kg, total: totalPesaje(p),
    adjuntos,
  };
}

// El café de un reporte de barista, para el cierre del día: con qué recibió, con qué
// entregó, cuánto consumió y si el pesaje de recepción coincidió con la entrega previa.
function cafeDeReporte(campos, respuestas) {
  const recibo  = campos.find(c => c.tipo === 'pesaje_cafe' && esApertura(c));
  const entrego = campos.find(c => c.tipo === 'pesaje_cafe' && !esApertura(c));
  if (!recibo || !entrego) return null;
  const r = respuestas?.[recibo.codigo], e = respuestas?.[entrego.codigo];
  const recibio = totalPesaje(r), entregoTotal = totalPesaje(e);
  return {
    recibio, entrego: entregoTotal,
    consumo: (recibio !== null && entregoTotal !== null) ? Math.round((recibio - entregoTotal) * 100) / 100 : null,
    coincide: valorPesaje(r).coincide,
    previa_nombre: valorPesaje(r).previa_nombre,
  };
}

module.exports = {
  esApertura, camposApertura, tieneApertura, aperturaBloqueada,
  fotosPesaje, codigosFotoApertura, valorPesaje, totalPesaje, faltantesPesaje,
  entregaPrevia, cafeDeReporte,
};
