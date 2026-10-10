// Las listas de las tareas y las cuentas de tiempo.
//
// Nada de lo que el encargado decide es texto libre: qué va a hacer, qué era, por qué
// cambia la fecha. Es lo que después permite contar cuántas diferencias fueron errores
// de carga y cuántas fueron plata. Las listas viven acá y el frontend las pide por API.

// Desde este día el sistema levanta tareas. Es el primer viernes después del cambio:
// el lunes el encargado arranca con lo que pasó desde el viernes.
const INICIO = '2026-10-09';

// Un gasto de menos de esto se aprueba solo (con comprobante). Desde esto, no se gasta
// sin que un dueño lo apruebe.
const TOPE_GASTO = 100000;

// Vencimientos que levantan tarea: los que vencen dentro de estos días.
const DIAS_VENCIMIENTO = 10;

// El control del café (pesaje contra lo vendido) levanta tarea desde esta diferencia, en kg.
const KG_CAFE = 1;

const TIPOS = {
  no_cargo: {
    label: 'No cargó el reporte',
    acciones: ['Hablar con el vendedor', 'Revisar el calendario de turnos', 'Ir al local'],
    resultados: [
      'Se olvidó de cargarlo',
      'Problema con el celular o el sistema',
      'Lo cargó otra persona del turno',
      'No trabajó nadie de ese puesto ese turno',
    ],
    pide_afectado: true,
  },
  ventas: {
    label: 'Ventas no coinciden con Fudo',
    acciones: ['Revisar el arqueo de caja', 'Revisar los tickets en Fudo', 'Hablar con el vendedor'],
    resultados: [
      'Error de carga del vendedor (la caja estaba bien)',
      'Faltante real de caja',
      'Sobrante de caja',
      'Ticket mal cobrado o anulado en Fudo',
      'Venta cobrada fuera de Fudo',
      'Venta ficticia para nota de crédito',
    ],
    // Estos resultados piden el monto: es lo que se compara contra la diferencia.
    con_monto: ['Venta ficticia para nota de crédito', 'Faltante real de caja', 'Sobrante de caja'],
    pide_afectado: true,
  },
  vencimiento: {
    label: 'Producto por vencer',
    acciones: ['Mover a otra tienda', 'Poner en promoción', 'Retirar de la venta', 'Devolver al proveedor'],
    resultados: [
      'Se movió a otra tienda',
      'Se vendió con promoción',
      'Se vendió antes de vencer',
      'Se retiró de la venta',
      'Se devolvió al proveedor',
    ],
  },
  mantenimiento: {
    label: 'Mantenimiento',
    acciones: ['Llamar al técnico', 'Pedir presupuesto', 'Comprar el repuesto', 'Arreglarlo nosotros'],
    resultados: [
      'Lo arregló un técnico',
      'Lo arreglamos nosotros',
      'Se cambió por uno nuevo',
      'No tiene arreglo: se retiró',
    ],
  },
  faltante: {
    label: 'Faltante de insumos',
    acciones: ['Pedir al proveedor', 'Traer de otra tienda', 'Comprar en el día'],
    resultados: ['Llegó del proveedor', 'Se trajo de otra tienda', 'Se compró', 'Se dejó de usar'],
  },
  ausencia: {
    label: 'Falta o tardanza',
    acciones: ['Hablar con el empleado', 'Revisar el fichaje'],
    resultados: [
      'Justificada (aviso o certificado)',
      'Sin justificar: se habló con el empleado',
      'Error de carga: no hubo falta',
    ],
  },
  queja: {
    label: 'Queja de un cliente',
    acciones: ['Hablar con el cliente', 'Hablar con el empleado', 'Revisar el producto'],
    resultados: [
      'Se resolvió con el cliente',
      'Se habló con el empleado',
      'Problema de producto: se avisó al proveedor',
      'No corresponde',
    ],
  },
  cafe: {
    label: 'El café no cierra',
    acciones: ['Revisar el pesaje con la barista', 'Revisar el maestro de café', 'Pesar de nuevo'],
    resultados: [
      'Error de carga del pesaje',
      'Desperdicio real',
      'Producto mal definido en el maestro',
      'Consumo del personal',
    ],
  },
};

const MOTIVOS_DESCARTE = [
  'Ya estaba resuelto',
  'No es un problema real',
  'Está repetida con otra tarea',
  'Diferencia menor por redondeo',
];

const AVANCES = [
  'Revisé el arqueo',
  'Revisé los tickets en Fudo',
  'Hablé con el vendedor',
  'Hablé con el proveedor o el técnico',
  'Fui al local',
  'Otro avance',
];

const MOTIVOS_PLAZO = [
  'Espero respuesta del vendedor',
  'Espero al técnico o al proveedor',
  'Espero un repuesto o un pedido',
  'No llegué a hacerlo',
  'Otro motivo',
];

const opciones = () => ({
  tipos: TIPOS, motivos_descarte: MOTIVOS_DESCARTE, avances: AVANCES,
  motivos_plazo: MOTIVOS_PLAZO, tope_gasto: TOPE_GASTO, inicio: INICIO,
});

// ── Relojes ──────────────────────────────────────────────────────────────────
// Dos tiempos separados. Mientras la tarea está en manos del encargado corre el suyo;
// cuando pide el cierre se frena y empieza el de los dueños. Si ustedes tardan en
// contestar, no se le cuenta a él.
function relojes(tarea, eventos, ahora = new Date()) {
  let encargado = 0, duenos = 0;
  let desde = new Date(tarea.created_at);
  let quien = 'encargado';
  const orden = [...eventos].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  for (const ev of orden) {
    const t = new Date(ev.created_at);
    if (quien === 'encargado' && ev.tipo === 'pidio_cierre') {
      encargado += t - desde; desde = t; quien = 'duenos';
    } else if (quien === 'duenos' && ['aprobada', 'pidio_mas', 'rechazada'].includes(ev.tipo)) {
      duenos += t - desde; desde = t;
      quien = ev.tipo === 'aprobada' ? 'nadie' : 'encargado';
    }
  }
  if (quien === 'encargado') encargado += ahora - desde;
  if (quien === 'duenos') duenos += ahora - desde;
  return { encargado_ms: encargado, duenos_ms: duenos, corre: quien };
}

// "2026-10-12" en Mendoza (el proceso corre con TZ de Mendoza).
function hoyMendoza() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

function diasEntre(desde, hasta) {
  return Math.round((Date.parse(`${hasta}T12:00:00`) - Date.parse(`${desde}T12:00:00`)) / 86400000);
}

// Vencida: está en manos del encargado y la fecha que él mismo puso ya pasó.
function diasVencida(tarea, hoy = hoyMendoza()) {
  if (!['nueva', 'en_curso'].includes(tarea.estado) || !tarea.plazo) return 0;
  const plazo = typeof tarea.plazo === 'string' ? tarea.plazo.slice(0, 10) : fechaStr(tarea.plazo);
  const d = diasEntre(plazo, hoy);
  return d > 0 ? d : 0;
}

function fechaStr(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

module.exports = {
  INICIO, TOPE_GASTO, DIAS_VENCIMIENTO, KG_CAFE,
  TIPOS, MOTIVOS_DESCARTE, AVANCES, MOTIVOS_PLAZO, opciones,
  relojes, hoyMendoza, diasEntre, diasVencida, fechaStr,
};
