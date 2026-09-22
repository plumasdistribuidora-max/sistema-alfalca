// El check de vencimientos: qué producto, cuántos y qué fecha trae el paquete.
//
// Antes esto era texto libre y cada uno lo escribía distinto ("ron", "alfajor ron",
// "alf ron y cognac"). Ahora el producto sale de un maestro chico que maneja Martín y
// la persona carga cuántos son y la fecha impresa; los días los saca el sistema.
//
// La cantidad es la que decide qué hacer: dos alfajores a quince días se venden solos,
// treinta necesitan una promo. Sin ese número el aviso no sirve para tomar una decisión.
//
// Los días se cuentan SIEMPRE contra la fecha del cierre, nunca contra hoy: abrir el
// cierre del lunes tiene que mostrar los días que faltaban el lunes.
const pool = require('../config/db');

// La lista que ve el empleado, en el orden que la ordenó Martín.
async function productosActivos() {
  const { rows } = await pool.query(
    'SELECT id, nombre FROM vencimiento_productos WHERE activo ORDER BY orden, id'
  );
  return rows;
}

// Todos, activos o no: un producto dado de baja tiene que seguir teniendo nombre en
// los cierres viejos donde aparece.
async function nombresDeProductos() {
  const { rows } = await pool.query('SELECT id, nombre FROM vencimiento_productos');
  return new Map(rows.map(r => [r.id, r.nombre]));
}

function diasEntre(desde, hasta) {
  return Math.round((Date.parse(`${hasta}T12:00:00`) - Date.parse(`${desde}T12:00:00`)) / 86400000);
}

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Un renglón del check, normalizado. Los reportes anteriores al cambio guardan
// { producto, dias } escritos a mano: se conservan tal cual para que sus cierres
// sigan diciendo exactamente lo mismo que decían.
function normalizar(it) {
  const o = it && typeof it === 'object' ? it : {};
  const producto_id = o.producto_id ? Number(o.producto_id) : null;
  const vence = ES_FECHA.test(String(o.vence || '')) ? String(o.vence) : null;
  const cantidad = Number(o.cantidad);
  return {
    producto_id, vence,
    cantidad: Number.isFinite(cantidad) && cantidad > 0 ? Math.round(cantidad) : null,
    legado_producto: producto_id ? null : (String(o.producto || '').trim() || null),
    legado_dias:     producto_id ? null : (o.dias ?? null),
  };
}

function items(valor) {
  const v = valor && typeof valor === 'object' ? valor : {};
  return (Array.isArray(v.items) ? v.items : []).map(normalizar);
}

// Lo que el cierre muestra de cada renglón: el nombre del maestro y los días que
// faltaban ese día. Un renglón viejo devuelve lo que se había escrito.
function paraCierre(it, fecha, nombres) {
  if (it.producto_id) {
    return {
      producto: nombres.get(it.producto_id) || 'producto dado de baja',
      cantidad: it.cantidad,
      vence:    it.vence,
      dias:     it.vence ? diasEntre(fecha, it.vence) : null,
    };
  }
  // Los renglones viejos no tienen cantidad y nunca la van a tener: se escribieron
  // cuando no se preguntaba. Va en null, no en cero, para no inventar un dato.
  return { producto: it.legado_producto, cantidad: null, vence: null, dias: it.legado_dias };
}

// Qué le falta al reporte antes de salir. Sin producto o sin fecha no hay dato que
// sirva, y una fecha ya vencida o a más de un año casi siempre es un error de tipeo.
async function faltantesVencimientos(reporte) {
  const campo = (reporte.respuestas || {}).vencimientos;
  if (!campo || !campo.hubo || campo.hay !== true) return [];

  const fecha   = (await pool.query('SELECT fecha::text AS fecha FROM reportes WHERE id = $1', [reporte.id])).rows[0].fecha;
  const nombres = await nombresDeProductos();
  const faltan  = [];

  for (const it of items(campo)) {
    if (it.legado_producto) continue;          // renglón viejo: no se le pide nada
    if (!it.producto_id || !nombres.has(it.producto_id)) {
      faltan.push('Vencimientos — elegí el producto de la lista');
      continue;
    }
    const nombre = nombres.get(it.producto_id);
    if (!it.cantidad) {
      faltan.push(`Vencimientos — decí cuántos hay de ${nombre}`);
    }
    if (!it.vence) {
      faltan.push(`Vencimientos — cargá la fecha que dice el paquete de ${nombre}`);
      continue;
    }
    const dias = diasEntre(fecha, it.vence);
    if (dias < 0)   faltan.push(`Vencimientos — la fecha de ${nombre} ya pasó: ${it.vence}`);
    if (dias > 365) faltan.push(`Vencimientos — revisá la fecha de ${nombre}: faltan ${dias} días`);
  }
  return faltan;
}

module.exports = { productosActivos, nombresDeProductos, items, paraCierre, faltantesVencimientos, diasEntre };
