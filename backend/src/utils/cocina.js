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
const fechaCorta = f => (f ? String(f).split('-').reverse().join('/') : 'sin fecha');

// Qué productos toca revisar un día, con los lotes que el sistema ya conoce.
// Un lote entra si alguien lo contó o si llegó en una factura y todavía no se cerró.
async function paraContar(fecha) {
  const dia = new Date(`${fecha}T12:00:00`).getDay();
  const { rows } = await pool.query(`
    SELECT p.id, p.proveedor, p.nombre, p.unidad, p.en_freezer, p.en_heladera, p.en_mostrador, p.orden,
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

// El repaso de la tarde: los pocos productos que vale la pena volver a mirar.
//
// Repetir los 25 a la tarde sale peor y lleva veinte minutos. Con cinco alcanza, y
// son los que sirven para algo: los que están por vencer y los que la mañana dejó
// raspando. Ese segundo conteo es además el que después dice en qué turno se perdió
// algo, porque parte el día en dos.
//
// "Casi no queda" mira el TOTAL, freezer más heladera, y no solo la heladera. Si
// tiene poco abajo pero el freezer lleno, la bajada de la mañana ya lo resolvió y
// marcarlo sería pedir que revisen algo que se acaba de reponer. Lo que importa es
// que se esté por acabar de verdad.
//
// El umbral fijo de 2 es provisorio: con el maestro de recetas se reemplaza por
// "menos de un día de consumo", que cambia según el producto.
const DIAS_PARA_VENCER = 7;
const CASI_NO_QUEDA = 2;
const MAX_REPASO = 6;

async function repasoDe(fecha, localId) {
  const dia = new Date(`${fecha}T12:00:00`).getDay();
  const { rows } = await pool.query(`
    WITH conteo_hoy AS (
      SELECT cl.lote_id, cl.freezer, cl.heladera, cl.mostrador
      FROM cocina_conteo_lineas cl
      JOIN cocina_conteos c ON c.id = cl.conteo_id
      WHERE c.fecha = $1::date AND c.local_id = $2
    ),
    por_producto AS (
      SELECT p.id, p.nombre,
             min(l.vence) FILTER (WHERE l.vence IS NOT NULL) AS proximo,
             sum(COALESCE(ch.freezer, 0) + COALESCE(ch.heladera, 0) + COALESCE(ch.mostrador, 0)) AS queda,
             count(ch.lote_id)                               AS contados
      FROM cocina_productos p
      JOIN cocina_lotes l ON l.producto_id = p.id AND NOT l.cerrado
      LEFT JOIN conteo_hoy ch ON ch.lote_id = l.id
      WHERE p.activo AND $3::smallint = ANY(p.dias_revision)
      GROUP BY p.id, p.nombre
    )
    SELECT id,
           CASE WHEN proximo IS NOT NULL AND proximo <= $1::date + $4
                THEN 'vence el ' || to_char(proximo, 'DD/MM')
                ELSE 'casi no queda' END AS motivo
    FROM por_producto
    WHERE (proximo IS NOT NULL AND proximo <= $1::date + $4)
       OR (contados > 0 AND queda <= $5)
    ORDER BY proximo NULLS LAST, queda
    LIMIT $6
  `, [fecha, localId, dia, DIAS_PARA_VENCER, CASI_NO_QUEDA, MAX_REPASO]);
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
  // La fecha tiene tres estados y no se pueden confundir: una fecha de verdad, null
  // ("no tiene fecha legible", elegido a propósito) y '' (quedó a medio completar).
  const fecha = v => {
    if (v === null) return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '';
  };
  return (Array.isArray(o.lineas) ? o.lineas : [])
    .map(l => ({
      producto_id: l?.producto_id ? Number(l.producto_id) : null,
      lote_id:     l?.lote_id ? Number(l.lote_id) : null,
      vence:       fecha(l?.vence),
      freezer:     num(l?.freezer),
      heladera:    num(l?.heladera),
      mostrador:   num(l?.mostrador),
    }))
    .filter(l => l.producto_id);
}

// Qué le falta al reporte. Se pide un número por cada casillero que la persona vio:
// un lote conocido tiene que tener contado el lugar donde ese producto vive. Dejar
// algo vacío no es "no hay": es "no lo conté", y eso rompe la comparación del día.
async function faltantesCocina(reporte) {
  const campo = (reporte.respuestas || {}).stock_cocina;
  const { fecha, turno } = (await pool.query('SELECT fecha::text AS fecha, turno FROM reportes WHERE id = $1', [reporte.id])).rows[0];

  // A la mañana se cuenta todo; a la tarde solo el repaso. Pedirle a la tarde los 25
  // sería pedirle un trabajo que nadie le mostró.
  let productos = await paraContar(fecha);
  if (turno !== 'Mañana') {
    const ids = new Set((await repasoDe(fecha, reporte.local_id)).map(r => r.id));
    productos = productos.filter(p => ids.has(p.id));
  }
  if (!productos.length) return [];

  const lineas = valorConteo(campo);
  const faltan = [];

  for (const p of productos) {
    const suyas = lineas.filter(l => l.producto_id === p.id);

    // Un producto que el sistema todavía no conoce igual tiene que contarse: es el
    // primer día, o se había acabado y volvió a entrar.
    if (!suyas.length) { faltan.push(`Stock — falta contar ${p.nombre}`); continue; }

    // Cada lote que el sistema ya conocía tiene que tener su renglón: si desapareció
    // de la heladera hay que decir que quedó en cero, no dejarlo en blanco.
    for (const lote of p.lotes) {
      if (!suyas.some(l => l.lote_id === lote.id || l.lote_id === lote.lote_id)) {
        faltan.push(`Stock — falta contar ${p.nombre} de ${fechaCorta(lote.vence)}`);
      }
    }

    for (const l of suyas) {
      const cual = `${p.nombre}${l.vence ? ` de ${fechaCorta(l.vence)}` : ''}`;
      if (!l.lote_id && l.vence === '') {
        faltan.push(`Stock — pusiste una fecha en ${p.nombre} y quedó sin completar`);
      }
      if (p.en_freezer   && l.freezer   === null) faltan.push(`Stock — cuántos hay en el freezer de ${cual}`);
      if (p.en_heladera  && l.heladera  === null) faltan.push(`Stock — cuántos hay en la heladera de ${cual}`);
      if (p.en_mostrador && l.mostrador === null) faltan.push(`Stock — cuántos hay en el mostrador de ${cual}`);
    }
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
        `, [l.producto_id, l.vence || null]);
        loteId = rows[0].id;
      }
      await client.query(`
        INSERT INTO cocina_conteo_lineas (conteo_id, lote_id, freezer, heladera, mostrador)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (conteo_id, lote_id) DO UPDATE SET
          freezer = EXCLUDED.freezer, heladera = EXCLUDED.heladera, mostrador = EXCLUDED.mostrador
      `, [conteo.id, loteId, l.freezer, l.heladera, l.mostrador]);
    }

    // Un lote que quedó en cero en los dos lados se cierra: deja de aparecer mañana.
    await client.query(`
      UPDATE cocina_lotes SET cerrado = true
      WHERE id IN (
        SELECT cl.lote_id FROM cocina_conteo_lineas cl
        WHERE cl.conteo_id = $1 AND COALESCE(cl.freezer, 0) = 0
          AND COALESCE(cl.heladera, 0) = 0 AND COALESCE(cl.mostrador, 0) = 0
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

module.exports = { paraContar, repasoDe, valorConteo, faltantesCocina, sincronizarCocina, DIAS };
