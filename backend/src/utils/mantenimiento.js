// Mantenimiento con seguimiento: lo que un turno reporta queda como ítem del local
// hasta que alguien diga que se solucionó. Acá viven las reglas que comparten el
// reporte del empleado (que informa y confirma) y el cierre del encargado (que dice
// cómo lo va a resolver).
const pool = require('../config/db');
const { esNovedad } = require('./reportes');

// Lo que se muestra como etiqueta del problema: el rubro del maestro, salvo que sea
// "Otra cosa", donde vale más lo que escribió la persona ("Sombrillas" antes que
// "Otra cosa"). Se arma en SQL porque lo piden las cuatro consultas de abajo.
const RUBRO_SQL = `CASE WHEN rb.es_otro THEN NULLIF(btrim(m.rubro_otro), '') ELSE rb.nombre END`;

// Los doce rubros que ve el empleado, en orden. "Otra cosa" va último y pide detalle.
async function rubrosActivos() {
  const { rows } = await pool.query(
    'SELECT id, nombre, es_otro FROM mantenimiento_rubros WHERE activo ORDER BY orden, id'
  );
  return rows;
}

// El campo "mantenimiento" de un reporte guarda:
//   { seguimiento: { [item_id]: 'sigue' | 'resuelto' },
//     nuevos:      [ { texto, rubro_id, rubro_otro?, item_id? } ] }
// Los reportes de antes del cambio guardan un texto suelto: se conserva como "legado"
// para que el consolidado de esos días lo siga mostrando.
function valorMantenimiento(v) {
  if (typeof v === 'string') {
    return { seguimiento: {}, nuevos: [], legado: esNovedad(v) ? v.trim() : null };
  }
  const o = v && typeof v === 'object' ? v : {};
  const seguimiento = {};
  for (const [id, resp] of Object.entries(o.seguimiento || {})) {
    if (resp === 'sigue' || resp === 'resuelto') seguimiento[id] = resp;
  }
  const nuevos = (Array.isArray(o.nuevos) ? o.nuevos : [])
    .map(x => ({
      texto:      String(x?.texto || '').trim(),
      rubro_id:   x?.rubro_id ? Number(x.rubro_id) : null,
      rubro_otro: String(x?.rubro_otro || '').trim() || null,
      item_id:    x?.item_id ? Number(x.item_id) : null,
    }))
    .filter(x => x.texto);
  return { seguimiento, nuevos, legado: null };
}

// Lo que sigue abierto en un local, con quién lo reportó y qué dijo el encargado.
// Se excluyen los ítems que nacieron en los reportes indicados: el propio reporte no
// tiene que confirmarse a sí mismo. Y entra lo reportado en días ANTERIORES a `fecha`
// más, si el turno es la tarde, lo que reportó la mañana de ese mismo día: cada
// problema tiene que tener su seguimiento en el turno siguiente. Una mañana no puede
// confirmar lo que la tarde reportó después, y al corregir un reporte viejo no tiene
// que contestar por lo que apareció después.
// Cada ítem trae el turno del reporte que lo creó, así la pantalla puede aplicar la
// misma regla según el turno elegido.
// Los baristas van aparte: lo que reportan (la máquina) lo siguen solo los reportes
// de barista, y ellos no ven lo de la encargada ni lo de cocina, aunque compartan
// local. El resto de los formularios comparten lo del local, como siempre.
async function pendientesDe(localId, excluirReportes = [], fecha = null, turno = null, plantilla = null) {
  const { rows } = await pool.query(`
    SELECT m.id, m.texto, m.fecha::text AS fecha, m.plan, u.nombre AS reportado_por, r.turno,
           m.rubro_id, ${RUBRO_SQL} AS rubro
    FROM mantenimiento_items m
    LEFT JOIN usuarios u ON u.id = m.reportado_por
    LEFT JOIN reportes r ON r.id = m.reporte_id
    LEFT JOIN mantenimiento_rubros rb ON rb.id = m.rubro_id
    WHERE m.local_id = $1 AND m.estado = 'abierto'
      AND (m.reporte_id IS NULL OR NOT (m.reporte_id = ANY($2::int[])))
      AND ($3::date IS NULL OR m.fecha < $3::date
           OR ($4::text = 'Tarde' AND m.fecha = $3::date AND r.turno = 'Mañana'))
      AND (($5::text = 'barista') = (r.plantilla_codigo = 'barista'))
    ORDER BY m.fecha, m.id
  `, [localId, excluirReportes.filter(Boolean), fecha, turno, plantilla]);
  return rows;
}

// Cuánto puede medir un problema. No es una manía de prolijidad: lo que no entra en
// un renglón corto casi siempre son dos problemas metidos en uno.
const LARGO_MAXIMO = 120;

// Qué le falta contestar a un reporte antes de enviarlo: cada pendiente del local
// tiene que tener un "sigue igual" o un "se solucionó", y cada problema nuevo tiene
// que decir qué cosa es. Sin rubro no se puede agrupar ni contar nada, así que el
// reporte no sale.
async function faltantesMantenimiento(reporte) {
  const v = valorMantenimiento((reporte.respuestas || {}).mantenimiento);
  const { fecha, turno, plantilla_codigo } = (await pool.query('SELECT fecha::text AS fecha, turno, plantilla_codigo FROM reportes WHERE id = $1', [reporte.id])).rows[0];
  const pendientes = await pendientesDe(reporte.local_id, [reporte.id], fecha, turno, plantilla_codigo);
  const faltan = pendientes
    .filter(p => !v.seguimiento[String(p.id)])
    .map(p => `Mantenimiento — decí si sigue igual o se solucionó: “${p.texto}”`);

  const rubros = await rubrosActivos();
  const porId  = new Map(rubros.map(r => [r.id, r]));
  for (const n of v.nuevos) {
    const rubro = porId.get(n.rubro_id);
    if (!rubro) {
      faltan.push(`Mantenimiento — elegí qué cosa es: “${n.texto}”`);
    } else if (rubro.es_otro && !n.rubro_otro) {
      faltan.push(`Mantenimiento — escribí qué cosa es, no alcanza con “${rubro.nombre}”: “${n.texto}”`);
    }
    if (n.texto.length > LARGO_MAXIMO) {
      faltan.push(`Mantenimiento — un problema por renglón, y corto: “${n.texto.slice(0, 40)}…” no entra en ${LARGO_MAXIMO} caracteres`);
    }
  }
  return faltan;
}

// Al enviar el reporte, lo que dijo el turno pasa a la tabla: los ítems nuevos se
// crean (y el reporte se queda con sus ids, así un reenvío los edita en vez de
// duplicarlos), los "se solucionó" cierran el ítem, y un "sigue igual" que corrige
// un "se solucionó" anterior del mismo reporte lo vuelve a abrir.
async function sincronizarMantenimiento(reporte, usuarioId) {
  const v = valorMantenimiento((reporte.respuestas || {}).mantenimiento);
  if (v.legado !== null) return;   // texto viejo: se deja como está

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const fecha = (await client.query('SELECT fecha::text AS fecha FROM reportes WHERE id = $1', [reporte.id])).rows[0].fecha;

    const propios = new Set(
      (await client.query('SELECT id FROM mantenimiento_items WHERE reporte_id = $1', [reporte.id])).rows.map(r => r.id)
    );
    const conservar = [];
    for (const nuevo of v.nuevos) {
      if (nuevo.item_id && propios.has(nuevo.item_id)) {
        await client.query(
          `UPDATE mantenimiento_items
           SET texto = $1, rubro_id = $2, rubro_otro = $3, updated_at = NOW()
           WHERE id = $4`,
          [nuevo.texto, nuevo.rubro_id, nuevo.rubro_otro, nuevo.item_id]
        );
      } else {
        const { rows } = await client.query(`
          INSERT INTO mantenimiento_items (local_id, texto, reporte_id, reportado_por, fecha, rubro_id, rubro_otro)
          VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
        `, [reporte.local_id, nuevo.texto, reporte.id, usuarioId, fecha, nuevo.rubro_id, nuevo.rubro_otro]);
        nuevo.item_id = rows[0].id;
      }
      conservar.push(nuevo.item_id);
    }
    // Lo que el turno sacó de la lista antes de reenviar.
    await client.query(
      'DELETE FROM mantenimiento_items WHERE reporte_id = $1 AND NOT (id = ANY($2::int[]))',
      [reporte.id, conservar]
    );

    for (const [id, resp] of Object.entries(v.seguimiento)) {
      if (resp === 'resuelto') {
        await client.query(`
          UPDATE mantenimiento_items
          SET estado = 'resuelto', resuelto_fecha = $2, resuelto_reporte_id = $3, updated_at = NOW()
          WHERE id = $1 AND estado = 'abierto'
        `, [Number(id), fecha, reporte.id]);
      } else {
        await client.query(`
          UPDATE mantenimiento_items
          SET estado = 'abierto', resuelto_fecha = NULL, resuelto_reporte_id = NULL, updated_at = NOW()
          WHERE id = $1 AND estado = 'resuelto' AND resuelto_reporte_id = $2
        `, [Number(id), reporte.id]);
      }
    }

    await client.query(
      `UPDATE reportes SET respuestas = jsonb_set(respuestas, '{mantenimiento}', $2::jsonb), updated_at = NOW()
       WHERE id = $1`,
      [reporte.id, JSON.stringify({ seguimiento: v.seguimiento, nuevos: v.nuevos })]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Los ítems que cuentan para el cierre de un día, tal como estaban ese día: los que
// ya existían y seguían abiertos, más los que se resolvieron ese mismo día. Mirar un
// día viejo tiene que mostrar lo que había entonces, no lo que hay hoy.
async function itemsDelDia(fecha) {
  const { rows } = await pool.query(`
    SELECT m.id, m.local_id, m.texto, m.fecha::text AS fecha, m.estado, m.plan,
           m.resuelto_fecha::text AS resuelto_fecha, m.reporte_id,
           u.nombre AS reportado_por, m.rubro_id, ${RUBRO_SQL} AS rubro
    FROM mantenimiento_items m
    LEFT JOIN usuarios u ON u.id = m.reportado_por
    LEFT JOIN mantenimiento_rubros rb ON rb.id = m.rubro_id
    WHERE m.fecha <= $1
      AND (m.estado = 'abierto' OR m.resuelto_fecha >= $1)
    ORDER BY m.local_id, m.fecha, m.id
  `, [fecha]);
  return rows;
}

// Los ítems que nombra un reporte (los que creó y los que confirmó), para mostrarlos
// con su texto al revisarlo.
async function itemsDeReporte(reporte) {
  const v = valorMantenimiento((reporte.respuestas || {}).mantenimiento);
  const ids = [
    ...Object.keys(v.seguimiento).map(Number),
    ...v.nuevos.map(x => x.item_id).filter(Boolean),
  ];
  const { rows } = await pool.query(`
    SELECT m.id, m.texto, m.fecha::text AS fecha, m.estado, m.plan, u.nombre AS reportado_por,
           m.rubro_id, ${RUBRO_SQL} AS rubro
    FROM mantenimiento_items m
    LEFT JOIN usuarios u ON u.id = m.reportado_por
    LEFT JOIN mantenimiento_rubros rb ON rb.id = m.rubro_id
    WHERE m.id = ANY($1::int[]) OR m.reporte_id = $2
  `, [ids, reporte.id]);
  return rows;
}

module.exports = {
  valorMantenimiento, pendientesDe, faltantesMantenimiento, rubrosActivos, LARGO_MAXIMO,
  sincronizarMantenimiento, itemsDelDia, itemsDeReporte,
};
