// Reportes en dos etapas: lo que se carga al RECIBIR el turno se confirma una vez y
// queda fijo; lo que se carga al ENTREGAR se envía al final.
//
// Un campo pertenece a la apertura si la plantilla le pone "etapa":"apertura". Hoy
// ningún formulario lo usa (el de barista lo usó y se simplificó a una sola etapa),
// pero el motor queda: cualquier formulario puede volver a tenerla desde el editor.
const { fotosPesaje } = require('./pesaje');

const esApertura = campo => campo.etapa === 'apertura';
const camposApertura = campos => campos.filter(esApertura);
const tieneApertura  = campos => campos.some(esApertura);

// Fijo durante el turno; si el encargado lo devolvió, se puede corregir entero.
const aperturaBloqueada = reporte => !!reporte.apertura_at && reporte.estado === 'borrador';

// Todos los códigos de adjunto que pertenecen a la apertura (campos foto y fotos de pesaje).
function codigosFotoApertura(campos) {
  const out = [];
  for (const c of camposApertura(campos)) {
    if (c.tipo === 'foto') out.push(c.codigo);
    if (c.tipo === 'pesaje_cafe') out.push(...Object.values(fotosPesaje(c.codigo)));
  }
  return out;
}

module.exports = { esApertura, camposApertura, tieneApertura, aperturaBloqueada, codigosFotoApertura };
