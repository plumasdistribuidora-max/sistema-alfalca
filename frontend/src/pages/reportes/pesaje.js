// El pesaje de café (bolsa abierta + bolsas cerradas, cada una con su foto). Espejo
// de backend/utils/pesaje.

export const fotosPesaje = codigo => ({ abierta: `${codigo}__abierta`, cerradas: `${codigo}__cerradas` });

const num = v => (v === '' || v === null || v === undefined || isNaN(Number(v))) ? null : Number(v);

export function totalPesaje(v) {
  const a = num(v?.abierta_kg), c = num(v?.cerradas_kg);
  if (a === null || c === null) return null;
  return Math.round((a + c) * 100) / 100;
}

// "1,8 kg" — con coma, como se escribe acá.
export const kg = v => v === null || v === undefined ? '—' : `${String(v).replace('.', ',')} kg`;

// Un campo puede decir distinto según el turno ("por_turno": { Mañana: {label, ayuda},
// Tarde: {...} }). Espejo de backend/utils/reportes → campoParaTurno.
export function campoParaTurno(campo, turno) {
  const extra = campo.por_turno?.[turno];
  return extra ? { ...campo, ...extra } : campo;
}
