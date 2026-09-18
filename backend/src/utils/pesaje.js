// El pesaje de café de un reporte de barista: kilos en la bolsa abierta (en la balanza
// de cocina) y en las bolsas cerradas (lo que dice cada una), cada uno con su foto.
//
// Hay dos por día: el de la mañana al entrar, antes de cargar la tolva, y el de la
// tarde al terminar, con la tolva vaciada de vuelta a la bolsa. La diferencia entre
// los dos es lo que consumió el café ese día.

// Las fotos de un pesaje viven en adjuntos con estos códigos.
const fotosPesaje = codigo => ({ abierta: `${codigo}__abierta`, cerradas: `${codigo}__cerradas` });

const num = v => (v === '' || v === null || v === undefined || isNaN(Number(v))) ? null : Number(v);

function valorPesaje(v) {
  const o = v && typeof v === 'object' ? v : {};
  return { abierta_kg: num(o.abierta_kg), cerradas_kg: num(o.cerradas_kg) };
}

function totalPesaje(v) {
  const p = valorPesaje(v);
  if (p.abierta_kg === null || p.cerradas_kg === null) return null;
  return Math.round((p.abierta_kg + p.cerradas_kg) * 100) / 100;
}

// Qué falta en un pesaje: los dos números y las dos fotos.
function faltantesPesaje(campo, valor, adjuntos) {
  const faltan = [];
  if (!campo.requerido) return faltan;
  const p = valorPesaje(valor);
  const f = fotosPesaje(campo.codigo);
  if (p.abierta_kg === null)  faltan.push(`${campo.label} — kilos en la bolsa abierta`);
  if (!adjuntos.some(a => a.campo_codigo === f.abierta))  faltan.push(`${campo.label} — foto de la balanza con la bolsa abierta`);
  if (p.cerradas_kg === null) faltan.push(`${campo.label} — kilos en bolsas cerradas`);
  if (!adjuntos.some(a => a.campo_codigo === f.cerradas)) faltan.push(`${campo.label} — foto de las bolsas cerradas`);
  return faltan;
}

// El pesaje de un reporte, si su formulario tiene uno y está completo.
function pesajeDeReporte(campos, respuestas) {
  const campo = campos.find(c => c.tipo === 'pesaje_cafe');
  if (!campo) return null;
  const p = valorPesaje(respuestas?.[campo.codigo]);
  const total = totalPesaje(p);
  if (total === null) return null;
  return { ...p, total };
}

module.exports = { fotosPesaje, valorPesaje, totalPesaje, faltantesPesaje, pesajeDeReporte };
