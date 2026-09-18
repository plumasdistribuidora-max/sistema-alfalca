// Reportes en dos etapas: lo que se carga al recibir el turno se confirma una vez y
// queda fijo; lo demás se carga al entregar. Espejo de backend/utils/etapas. Hoy
// ningún formulario usa etapas, pero el motor queda por si se vuelve a necesitar.
import { fotosPesaje, totalPesaje, kg } from './pesaje';

export const esApertura = c => c.etapa === 'apertura';
export const camposApertura = campos => campos.filter(esApertura);
export const camposEntrega  = campos => campos.filter(c => !esApertura(c) && c.codigo !== 'turno');
export const tieneApertura  = campos => campos.some(esApertura);

const HORA = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Mendoza' });
export const hora = ts => ts ? HORA.format(new Date(ts)) : '';

// Los códigos de adjunto de la apertura (campos foto y fotos de pesaje).
export const codigosFotoApertura = campos => camposApertura(campos).flatMap(c =>
  c.tipo === 'foto' ? [c.codigo] : c.tipo === 'pesaje_cafe' ? Object.values(fotosPesaje(c.codigo)) : []
);

// La frase que resume la apertura, con lo que haya: sí/no y pesajes de la etapa.
export function resumenApertura(campos, respuestas) {
  const partes = [];
  for (const c of camposApertura(campos)) {
    const v = respuestas?.[c.codigo];
    if (c.tipo === 'si_no' && typeof v === 'boolean') partes.push(`${c.label} ${v ? 'Sí' : 'No'}.`);
    if (c.tipo === 'pesaje_cafe') {
      const t = totalPesaje(v);
      if (t !== null) partes.push(`Café: ${kg(v.abierta_kg)} en bolsa abierta + ${kg(v.cerradas_kg)} en bolsas cerradas = ${kg(t)}.`);
    }
  }
  return partes.join(' ');
}
