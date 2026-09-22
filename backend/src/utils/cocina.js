// El stock de cocina: qué hay, dónde y con qué vencimiento.
//
// Un producto vive en dos lugares a la vez —el freezer es la reserva, la heladera es
// lo que está listo para hoy— y dentro de cada producto conviven lotes con fechas
// distintas. Por eso el conteo no es un número por producto: es un número por lote y
// por lugar.
//
// La regla que más importa de este archivo: **el formulario nunca muestra cuánto
// debería haber**. Trae las fechas ya puestas, porque tipear fechas es lento y se
// presta a errores, pero los casilleros arrancan vacíos. Si el que cuenta ve el
// número esperado, lo copia y el control deja de servir.
const pool = require('../config/db');

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Qué productos toca revisar un día, con los lotes que el sistema ya conoce.
// Un lote entra si alguien lo contó o si llegó en una factura y todavía no se cerró.
async function paraContar(fecha) {
  const dia = new Date(`${fecha}T12:00:00`).getDay();
  const { rows } = await pool.query(`
    SELECT p.id, p.proveedor, p.nombre, p.unidad, p.en_freezer, p.en_heladera, p.orden,
           COALESCE(
             (SELECT jsonb_agg(jsonb_build_object('lote_id', l.id, 'vence', l.vence::text)
                     ORDER BY l.vence NULLS LAST, l.id)
              FROM cocina_lotes l
              WHERE l.producto_id = p.id AND NOT l.cerrado),
             '[]'::jsonb) AS lotes
    FROM cocina_productos p
    WHERE p.activo AND $1::smallint = ANY(p.dias_revision)
    ORDER BY p.orden, p.id
  `, [dia]);
  return rows;
}

// El conteo tal como lo guarda el reporte:
//   { lineas: [ { producto_id, lote_id?, vence?, freezer, heladera } ] }
// Un renglón sin lote_id es una fecha nueva que apareció hoy.
function valorConteo(v) {
  const o = v && typeof v === 'object' ? v : {};
  const num = x => {
    if (x === '' || x === null || x === undefined) return null;
    const n = Number(String(x).replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  return (Array.isArray(o.lineas) ? o.lineas : [])
    .map(l => ({
      producto_id: l?.producto_id ? Number(l.producto_id) : null,
      lote_id:     l?.lote_id ? Number(l.lote_id) : null,
      vence:       /^\d{4}-\d{2}-\d{2}$/.test(String(l?.vence || '')) ? String(l.vence) : null,
      freezer:     num(l?.freezer),
      heladera:    num(l?.heladera),
    }))
    .filter(l => l.producto_id);
}

// Qué le falta al reporte. Se pide un número por cada casillero que la persona vio:
// un lote conocido tiene que tener contado el lugar donde ese producto vive. Dejar
// algo vacío no es "no hay": es "no lo conté", y eso rompe la comparación del día.
async function faltantesCocina(reporte) {
  const campo = (reporte.respuestas || {}).stock_cocina;
  const { fecha } = (await pool.query('SELECT fecha::text AS fecha FROM reportes WHERE id = $1', [reporte.id])).rows[0];
  const productos = await paraContar(fecha);
  if (!productos.length) return [];

  const lineas = valorConteo(campo);
  const porClave = new Map(lineas.map(l => [`${l.producto_id}:${l.lote_id ?? 'n' + l.vence}`, l]));
  const faltan = [];

  for (const p of productos) {
    const lotes = p.lotes.length ? p.lotes : [{ lote_id: null, vence: null }];
    for (const lote of lotes) {
      const l = porClave.get(`${p.id}:${lote.lote_id ?? 'n' + lote.vence}`);
      const cual = `${p.nombre}${lote.vence ? ` (vence ${lote.vence.split('-').reverse().join('/')})` : ''}`;
      if (!l) { faltan.push(`Stock — falta contar ${cual}`); continue; }
      if (p.en_freezer  && l.freezer  === null) faltan.push(`Stock — cuántos hay en el freezer de ${cual}`);
      if (p.en_heladera && l.heladera === null) faltan.push(`Stock — cuántos hay en la heladera de ${cual}`);
    }
  }
  // Una fecha nueva sin fecha cargada no se puede guardar como lote.
  for (const l of lineas) {
    if (!l.lote_id && !l.vence) faltan.push('Stock — pusiste una fecha nueva pero quedó sin completar');
  }
  return faltan.slice(0, 12);
}

// Al enviar el reporte, el conteo pasa a sus tablas. Los lotes nuevos se crean acá,
// así la próxima vez ya aparecen con su fecha puesta.
async function sincronizarCocina(reporte, usuarioId) {
  const lineas = valorConteo((reporte.respuestas || {}).stock_cocina);
  if (!lineas.length) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { fecha } = (await client.query('SELECT fecha::text AS fecha FROM reportes WHERE id = $1', [reporte.id])).rows[0];

    const { rows: [conteo] } = await client.query(`
      INSERT INTO cocina_conteos (local_id, fecha, reporte_id, usuario_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (reporte_id) DO UPDATE SET fecha = EXCLUDED.fecha, updated_at = NOW()
      RETURNING id
    `, [reporte.local_id, fecha, reporte.id, usuarioId]);

    // Se reescribe entero: si corrigen el reporte, vale el último conteo.
    await client.query('DELETE FROM cocina_conteo_lineas WHERE conteo_id = $1', [conteo.id]);

    for (const l of lineas) {
      let loteId = l.lote_id;
      if (!loteId) {
        const { rows } = await client.query(`
          INSERT INTO cocina_lotes (producto_id, vence, origen) VALUES ($1, $2, 'conteo')
          ON CONFLICT (producto_id, COALESCE(vence, '1900-01-01'::date)) DO UPDATE SET cerrado = false
          RETURNING id
        `, [l.producto_id, l.vence]);
        loteId = rows[0].id;
      }
      await client.query(`
        INSERT INTO cocina_conteo_lineas (conteo_id, lote_id, freezer, heladera)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (conteo_id, lote_id) DO UPDATE SET freezer = EXCLUDED.freezer, heladera = EXCLUDED.heladera
      `, [conteo.id, loteId, l.freezer, l.heladera]);
    }

    // Un lote que quedó en cero en los dos lados se cierra: deja de aparecer mañana.
    await client.query(`
      UPDATE cocina_lotes SET cerrado = true
      WHERE id IN (
        SELECT cl.lote_id FROM cocina_conteo_lineas cl
        WHERE cl.conteo_id = $1 AND COALESCE(cl.freezer, 0) = 0 AND COALESCE(cl.heladera, 0) = 0
      )
    `, [conteo.id]);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { paraContar, valorConteo, faltantesCocina, sincronizarCocina, DIAS };
