// Reglas compartidas entre la grilla del día (/reportes/dia) y el consolidado: cuando
// dos personas cargaron el mismo turno del mismo local, cuál de los dos vale.

// Cuánto "avanzó" cada estado, para elegir cuál mostrar cuando hay más de uno.
const PESO_ESTADO = { borrador: 0, observado: 1, enviado: 2, aprobado: 3 };

// Entre varios reportes del mismo turno gana el más avanzado y, a igual estado, el que
// se envió primero: si alguien carga de nuevo un turno que ya estaba enviado, el que
// vale es el original. Un borrador ajeno no puede tapar un reporte enviado.
function elegirReporte(lista) {
  return [...lista].sort((a, b) =>
    PESO_ESTADO[b.estado] - PESO_ESTADO[a.estado]
    || (Date.parse(a.enviado_at) || Infinity) - (Date.parse(b.enviado_at) || Infinity)
    || a.id - b.id
  )[0] || null;
}

// Uno por (local, plantilla, turno), con la misma regla.
function unoPorTurno(reportes) {
  const grupos = new Map();
  for (const r of reportes) {
    const clave = `${r.local_id}|${r.plantilla_codigo}|${r.turno}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(r);
  }
  return [...grupos.values()].map(elegirReporte);
}

// El placeholder de los campos de texto dice "Sin novedades", y la gente lo escribe
// tal cual en vez de dejarlo vacío. Sin esto, cada turno sube una novedad que no lo es.
const NADA = [
  'sin novedades', 'sin novedad', 'ninguna', 'ninguno', 'nada', 'no', 'no hubo',
  'todo bien', 'sin nada', 'n/a', 'na', '-', '--', '.', 'ok',
];
function esNovedad(texto) {
  const t = String(texto || '')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[.!,]/g, '').trim();
  return t !== '' && !NADA.includes(t);
}

// Un campo puede decir distinto según el turno ("por_turno": { Mañana: {label, ayuda},
// Tarde: {...} }): el pesaje de café de la mañana es "al empezar el día" y el de la
// tarde "al terminar". Devuelve el campo con los textos del turno pisados.
function campoParaTurno(campo, turno) {
  const extra = campo.por_turno?.[turno];
  return extra ? { ...campo, ...extra } : campo;
}

module.exports = { PESO_ESTADO, elegirReporte, unoPorTurno, esNovedad, campoParaTurno };
