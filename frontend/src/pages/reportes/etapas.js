// Reportes en dos etapas (barista): lo que se carga al recibir el turno se confirma
// una vez y queda fijo; lo demás se carga al entregar. Espejo de backend/utils/etapas.

export const esApertura = c => c.etapa === 'apertura';
export const camposApertura = campos => campos.filter(esApertura);
export const camposEntrega  = campos => campos.filter(c => !esApertura(c) && c.codigo !== 'turno');
export const tieneApertura  = campos => campos.some(esApertura);

export const fotosPesaje = codigo => ({ abierta: `${codigo}__abierta`, cerradas: `${codigo}__cerradas` });

const num = v => (v === '' || v === null || v === undefined || isNaN(Number(v))) ? null : Number(v);

export function totalPesaje(v) {
  const a = num(v?.abierta_kg), c = num(v?.cerradas_kg);
  if (a === null || c === null) return null;
  return Math.round((a + c) * 100) / 100;
}

// "1,8 kg" — con coma, como se escribe acá.
export const kg = v => v === null || v === undefined ? '—' : `${String(v).replace('.', ',')} kg`;

const HORA = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Mendoza' });
export const hora = ts => ts ? HORA.format(new Date(ts)) : '';

// La frase que resume la apertura: "Tolva vacía. Café: 1,8 kg + 10 kg = 11,8 kg.
// Equipamiento en orden." Se arma con lo que haya: sí/no y pesajes de la etapa.
export function resumenApertura(campos, respuestas) {
  const partes = [];
  for (const c of camposApertura(campos)) {
    const v = respuestas?.[c.codigo];
    if (c.tipo === 'si_no' && typeof v === 'boolean') {
      partes.push(fraseSiNo(c, v));
    }
    if (c.tipo === 'pesaje_cafe') {
      const t = totalPesaje(v);
      if (t !== null) partes.push(`Café: ${kg(v.abierta_kg)} en bolsa abierta + ${kg(v.cerradas_kg)} en bolsas cerradas = ${kg(t)}.`);
    }
  }
  return partes.join(' ');
}

// El cierre: con qué se entrega y cuánto se consumió contra la apertura.
export function resumenEntrega(campos, respuestas) {
  const recibo  = campos.find(c => c.tipo === 'pesaje_cafe' && esApertura(c));
  const entrego = campos.find(c => c.tipo === 'pesaje_cafe' && !esApertura(c));
  if (!entrego) return null;
  const e = respuestas?.[entrego.codigo];
  const tE = totalPesaje(e);
  if (tE === null) return null;
  const tR = recibo ? totalPesaje(respuestas?.[recibo.codigo]) : null;
  const consumo = tR !== null ? Math.round((tR - tE) * 100) / 100 : null;
  return {
    texto: `Tolva vacía. Café: ${kg(e.abierta_kg)} en bolsa abierta + ${kg(e.cerradas_kg)} en bolsas cerradas = ${kg(tE)}.`,
    consumo, recibio: tR, entrego: tE,
  };
}

// "¿Recibís la tolva vacía?" + true → "Tolva vacía." ; false → "Tolva NO vacía."
function fraseSiNo(campo, v) {
  const l = campo.label.toLowerCase();
  if (l.includes('tolva'))        return v ? 'Tolva vacía.' : 'Tolva NO vacía: quedó la foto.';
  if (l.includes('equipamiento')) return v ? 'Equipamiento en orden.' : 'Equipamiento NO en orden: quedó la foto.';
  return `${campo.label} ${v ? 'Sí' : 'No'}.`;
}
