// Listas y formatos que comparten las pantallas de Senzen. Las listas son las mismas que
// valida el backend (routes/senzen.js): nada de texto libre en lo que carga Pepa.

export const TIPOS = [
  ['supermercado', 'Supermercado'], ['minimercado', 'Minimercado'], ['almacen', 'Almacén'],
  ['casa_limpieza', 'Casa de limpieza'], ['bazar', 'Bazar'], ['ferreteria', 'Ferretería'], ['otro', 'Otro'],
];
export const MEDIOS = [['visita', 'Visita'], ['llamada', 'Llamada'], ['whatsapp', 'WhatsApp']];
// Qué pasó al contactar a un cliente que ya compró, y cómo le fue en la visita a un comercio
// nuevo (23/10/2026). RESULTADOS junta todos para mostrar contactos viejos y nuevos.
export const RESULTADOS_CONTACTO = [
  ['sin_respuesta', 'No tuve respuesta'], ['pedido', 'Me pasó un pedido'], ['va_a_comprar', 'Va a comprar'],
  ['volver', 'Volver a hablarle'], ['no_quiere', 'No quiere comprar más'],
];
export const RESULTADOS_NUEVO = [
  ['le_intereso', 'Le interesó'], ['pedido', 'Hizo un pedido'], ['volver', 'Volver a pasar'], ['no_le_interesa', 'No le interesa'],
];
export const RESULTADOS = [
  ...RESULTADOS_CONTACTO, ['le_intereso', 'Le interesó'], ['no_le_interesa', 'No le interesa'], ['no_compro', 'No compró'],
];
export const PIDEN_FECHA = ['va_a_comprar', 'volver'];
export const SENZEN = '#4f7a58';
export const MOTIVOS = [
  ['tiene_stock', 'Tiene stock'], ['precio', 'Precio'], ['no_estaba', 'No estaba el dueño'],
  ['otra_marca', 'Trabaja otra marca'], ['no_le_interesa', 'No le interesa'],
];
export const TAREAS = {
  volver:       'Volver a hablarle',
  va_a_comprar: 'Dijo que iba a comprar',
  dormido:      'Hace rato que no compra',
  segunda:      'Segunda visita después de su primera compra',
  visitar:      'Encargo de los dueños',
};
export const ESTADOS = {
  prospecto: ['Todavía no compró', 'bg-stone-100 text-stone-600'],
  compro:    ['Compró una vez', 'bg-amber-100 text-amber-800'],
  repite:    ['Repite', 'bg-emerald-100 text-emerald-800'],
};

export const label = (lista, v) => lista.find(x => x[0] === v)?.[1] || v || '—';

export const fmt = n => `$ ${Math.round(n || 0).toLocaleString('es-AR')}`;
export const pc  = n => n == null ? '—' : `${(n * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`;

const MES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const DIA = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
export const mesN = p => MES[Number(p.slice(5, 7)) - 1];
export const fechaCorta = iso => iso ? `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}` : '—';

// "hoy", "mañana", "ayer", "el jueves 23/10" o "hace 12 días".
export function cuando(iso, hoy) {
  if (!iso) return '—';
  const d = Math.round((new Date(iso + 'T12:00:00') - new Date(hoy + 'T12:00:00')) / 86400000);
  if (d === 0) return 'hoy';
  if (d === 1) return 'mañana';
  if (d === -1) return 'ayer';
  if (d < 0) return `hace ${-d} días`;
  if (d < 7) return `el ${DIA[new Date(iso + 'T12:00:00').getDay()]} ${fechaCorta(iso)}`;
  return `el ${fechaCorta(iso)}`;
}

export const sumarDias = (iso, n) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const hoyLocal = () => sumarDias(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Mendoza' }), 0);

export const NUNITO = { fontFamily: 'Nunito, sans-serif' };
