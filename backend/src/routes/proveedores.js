'use strict';

const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRol, ROLES } = require('../middleware/auth');
const { hoyStr } = require('../utils/fechas');
const { unidadValida } = require('../utils/unidades');

const router = express.Router();

// Quien carga el reporte del turno necesita la lista para elegir el proveedor, pero
// nada más que eso. Todo lo demás — dar de alta, cargar facturas a mano y anotar
// pagos — es del encargado (y del dueño, que requireRol deja pasar siempre).
const soloEncargado = requireRol(ROLES.ENCARGADO_GENERAL);

const MEDIOS = ['santander', 'mp', 'galicia', 'efectivo', 'cheque'];
const n = v => Number(v) || 0;

const esFecha = f => /^\d{4}-\d{2}-\d{2}$/.test(String(f || ''));
// "$ 1.234.567", para los mensajes de error que hablan de plata.
const money = v => `$ ${Math.round(n(v)).toLocaleString('es-AR')}`;

// Suma los pagos de cada factura para saber el saldo. Va como subconsulta y no como
// JOIN + GROUP BY porque la factura también se agrupa por sus renglones en otras
// consultas, y anidar dos agregados sobre la misma fila trae el doble de todo.
const SELECT_FACTURAS = `
  SELECT f.id, f.numero, f.fecha::text AS fecha, f.vencimiento::text AS vencimiento,
         f.total, f.local_id, f.reporte_id, f.importado_de,
         f.proveedor AS proveedor_texto,
         f.proveedor_id,
         COALESCE(p.nombre, f.proveedor) AS proveedor,
         p.medio_pago, p.dias_pago, p.plazo_dias,
         l.nombre AS local_nombre,
         u.nombre AS cargada_por,
         (SELECT COALESCE(SUM(pg.monto), 0) FROM pagos_proveedor pg WHERE pg.factura_id = f.id) AS pagado
  FROM facturas f
  LEFT JOIN proveedores p ON p.id = f.proveedor_id
  LEFT JOIN locales     l ON l.id = f.local_id
  LEFT JOIN usuarios    u ON u.id = f.created_by
`;

function armarFactura(row) {
  const total  = n(row.total);
  const pagado = n(row.pagado);
  return {
    id: row.id,
    numero: row.numero,
    fecha: row.fecha,
    vencimiento: row.vencimiento,
    total,
    pagado,
    saldo: total - pagado,
    local_id: row.local_id,
    local_nombre: row.local_nombre,
    proveedor_id: row.proveedor_id,
    proveedor: row.proveedor,
    medio_pago: row.medio_pago || 'santander',
    dias_pago: row.dias_pago || [1, 2, 3, 4, 5],
    cargada_por: row.cargada_por,
    // Si vino de un reporte de turno, la cargó quien hizo el turno; si vino de una
    // planilla, dice de qué hoja y fila; si no, la cargó el encargado a mano.
    origen: row.reporte_id ? 'formulario' : row.importado_de ? 'planilla' : 'manual',
    importado_de: row.importado_de || null,
  };
}

// El primer día, contando desde `desde`, en que ese proveedor cobra. Sirve para
// avisar "no cobra antes del viernes" cuando se está armando un pago.
function proximoDiaPago(diasPago, desde) {
  const dias = (diasPago && diasPago.length) ? diasPago.map(Number) : [1, 2, 3, 4, 5];
  const base = new Date(`${desde}T00:00:00`);
  for (let i = 0; i < 14; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    if (dias.includes(d.getDay())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  }
  return null;
}

function validarProveedor(body) {
  const nombre = String(body.nombre || '').trim();
  if (!nombre) return { error: 'Ponele el nombre al proveedor' };

  const medio = String(body.medio_pago || 'santander');
  if (!MEDIOS.includes(medio)) return { error: 'Esa forma de pago no existe' };

  const dias = Array.isArray(body.dias_pago)
    ? [...new Set(body.dias_pago.map(Number))].filter(d => d >= 0 && d <= 6).sort((a, b) => a - b)
    : [];
  if (!dias.length) return { error: 'Marcá al menos un día en que cobra' };

  const plazo = Number(body.plazo_dias);
  if (!Number.isInteger(plazo) || plazo < 0 || plazo > 365) {
    return { error: 'El plazo tiene que ser un número de días entre 0 y 365' };
  }

  return { datos: { nombre, medio, dias, plazo, nota: String(body.nota || '').trim() || null } };
}

// ── GET /lista ────────────────────────────────────────────────────────────────
// La usa el formulario del turno: solo lo necesario para llenar el desplegable.

router.get('/lista', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, nombre, medio_pago, plazo_dias
      FROM proveedores WHERE activo = true
      ORDER BY lower(nombre)
    `);
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error('[proveedores/lista]', err);
    res.status(500).json({ ok: false, error: 'No se pudo traer la lista de proveedores' });
  }
});

// ── GET / ─────────────────────────────────────────────────────────────────────
// Las fichas con la deuda de cada uno.

router.get('/', requireAuth, soloEncargado, async (req, res) => {
  try {
    const hoy = hoyStr();
    const { rows } = await pool.query(`
      SELECT p.id, p.nombre, p.medio_pago, p.dias_pago, p.plazo_dias, p.nota, p.activo,
             COALESCE(d.abiertas, 0)::int   AS facturas_abiertas,
             COALESCE(d.deuda, 0)           AS deuda,
             COALESCE(d.vencidas, 0)::int   AS vencidas,
             d.proximo_vencimiento::text AS proximo_vencimiento,
             COALESCE(pg.pagado, 0)         AS pagado_historico
      FROM proveedores p
      LEFT JOIN (
        SELECT f.proveedor_id,
               COUNT(*)                                        AS abiertas,
               SUM(f.saldo)                                    AS deuda,
               COUNT(*) FILTER (WHERE f.vencimiento < $1::date) AS vencidas,
               MIN(f.vencimiento)                              AS proximo_vencimiento
        FROM (
          SELECT f.proveedor_id, f.vencimiento,
                 f.total - COALESCE((SELECT SUM(monto) FROM pagos_proveedor WHERE factura_id = f.id), 0) AS saldo
          FROM facturas f
        ) f
        WHERE f.saldo > 0
        GROUP BY f.proveedor_id
      ) d ON d.proveedor_id = p.id
      LEFT JOIN (
        SELECT fa.proveedor_id, SUM(pg.monto) AS pagado
        FROM pagos_proveedor pg JOIN facturas fa ON fa.id = pg.factura_id
        GROUP BY fa.proveedor_id
      ) pg ON pg.proveedor_id = p.id
      ORDER BY COALESCE(d.deuda, 0) DESC, lower(p.nombre)
    `, [hoy]);

    res.json({
      ok: true,
      data: rows.map(r => ({
        ...r,
        deuda: n(r.deuda),
        pagado_historico: n(r.pagado_historico),
        dias_pago: r.dias_pago || [],
        proximo_dia_pago: proximoDiaPago(r.dias_pago, hoy),
      })),
    });
  } catch (err) {
    console.error('[proveedores GET]', err);
    res.status(500).json({ ok: false, error: 'No se pudieron traer los proveedores' });
  }
});

// ── POST / ────────────────────────────────────────────────────────────────────

router.post('/', requireAuth, soloEncargado, async (req, res) => {
  const { error, datos } = validarProveedor(req.body);
  if (error) return res.status(400).json({ ok: false, error });

  try {
    const { rows } = await pool.query(`
      INSERT INTO proveedores (nombre, medio_pago, dias_pago, plazo_dias, nota)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [datos.nombre, datos.medio, datos.dias, datos.plazo, datos.nota]);
    res.status(201).json({ ok: true, data: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'Ya existe un proveedor con ese nombre' });
    }
    console.error('[proveedores POST]', err);
    res.status(500).json({ ok: false, error: 'No se pudo guardar el proveedor' });
  }
});

// ── PUT /:id ──────────────────────────────────────────────────────────────────

router.put('/:id', requireAuth, soloEncargado, async (req, res) => {
  const { error, datos } = validarProveedor(req.body);
  if (error) return res.status(400).json({ ok: false, error });

  try {
    const { rows } = await pool.query(`
      UPDATE proveedores SET
        nombre = $2, medio_pago = $3, dias_pago = $4, plazo_dias = $5,
        nota = $6, activo = COALESCE($7, activo), updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [
      req.params.id, datos.nombre, datos.medio, datos.dias, datos.plazo, datos.nota,
      typeof req.body.activo === 'boolean' ? req.body.activo : null,
    ]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Ese proveedor no existe' });
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'Ya existe un proveedor con ese nombre' });
    }
    console.error('[proveedores PUT]', err);
    res.status(500).json({ ok: false, error: 'No se pudo guardar el proveedor' });
  }
});

// ── DELETE /:id ───────────────────────────────────────────────────────────────
// Si tiene facturas se desactiva en vez de borrarse: borrarlo dejaría facturas
// viejas sin dueño y rompería el histórico de lo que se le compró.

router.delete('/:id', requireAuth, soloEncargado, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM facturas WHERE proveedor_id = $1', [req.params.id]
    );
    if (rows[0].n > 0) {
      await pool.query('UPDATE proveedores SET activo = false, updated_at = NOW() WHERE id = $1', [req.params.id]);
      return res.json({ ok: true, data: { desactivado: true, facturas: rows[0].n } });
    }
    await pool.query('DELETE FROM proveedores WHERE id = $1', [req.params.id]);
    res.json({ ok: true, data: { desactivado: false } });
  } catch (err) {
    console.error('[proveedores DELETE]', err);
    res.status(500).json({ ok: false, error: 'No se pudo borrar el proveedor' });
  }
});

// ── GET /facturas ─────────────────────────────────────────────────────────────
// Por defecto, lo que se debe. `estado=todas` trae también las saldadas.

router.get('/facturas', requireAuth, soloEncargado, async (req, res) => {
  try {
    const hoy = hoyStr();
    const cond = [];
    const args = [];

    if (req.query.proveedor_id) {
      args.push(req.query.proveedor_id);
      cond.push(`f.proveedor_id = $${args.length}`);
    }
    if (req.query.local_id) {
      args.push(req.query.local_id);
      cond.push(`f.local_id = $${args.length}`);
    }

    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    const { rows } = await pool.query(`${SELECT_FACTURAS} ${where} ORDER BY f.fecha, f.id`, args);

    // Las más viejas primero: lo que se mira es cuánto hace que está sin pagar.
    let facturas = rows.map(armarFactura);
    if (req.query.estado !== 'todas') facturas = facturas.filter(f => f.saldo > 0);
    if (req.query.estado === 'vencidas') facturas = facturas.filter(f => f.vencimiento < hoy);
    if (req.query.estado === 'parciales') facturas = facturas.filter(f => f.pagado > 0);

    res.json({ ok: true, data: facturas });
  } catch (err) {
    console.error('[proveedores/facturas]', err);
    res.status(500).json({ ok: false, error: 'No se pudieron traer las facturas' });
  }
});

// ── POST /facturas ────────────────────────────────────────────────────────────
// Carga a mano: lo que no pasa por el formulario del turno.

router.post('/facturas', requireAuth, soloEncargado, async (req, res) => {
  const client = await pool.connect();
  try {
    const { proveedor_id, numero, fecha, vencimiento, total, local_id, items } = req.body;

    if (!proveedor_id) return res.status(400).json({ ok: false, error: 'Elegí el proveedor' });
    if (!local_id)     return res.status(400).json({ ok: false, error: 'Elegí el local' });
    if (!esFecha(fecha)) return res.status(400).json({ ok: false, error: 'Fecha inválida' });
    if (n(total) <= 0) return res.status(400).json({ ok: false, error: 'Falta el total de la factura' });

    const prov = await client.query('SELECT nombre, plazo_dias FROM proveedores WHERE id = $1', [proveedor_id]);
    if (!prov.rows.length) return res.status(404).json({ ok: false, error: 'Ese proveedor no existe' });

    // Si no mandan vencimiento, sale del plazo de la ficha.
    let vence = esFecha(vencimiento) ? vencimiento : null;
    if (!vence) {
      const d = new Date(`${fecha}T00:00:00`);
      d.setDate(d.getDate() + prov.rows[0].plazo_dias);
      vence = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    await client.query('BEGIN');
    const f = await client.query(`
      INSERT INTO facturas (local_id, proveedor, proveedor_id, numero, fecha, vencimiento, total, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id
    `, [
      local_id, prov.rows[0].nombre, proveedor_id,
      String(numero || '').trim() || null, fecha, vence, n(total), req.user.id,
    ]);

    for (const it of (items || [])) {
      if (!it.producto?.trim()) continue;
      await client.query(`
        INSERT INTO facturas_items (factura_id, producto, cantidad, unidad, precio_unit)
        VALUES ($1,$2,$3,$4,$5)
      `, [f.rows[0].id, it.producto.trim(), n(it.cantidad) || 1, unidadValida(it.unidad), n(it.precio_unit)]);
    }
    await client.query('COMMIT');

    res.status(201).json({ ok: true, data: { id: f.rows[0].id } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[proveedores/facturas POST]', err);
    res.status(500).json({ ok: false, error: 'No se pudo guardar la factura' });
  } finally {
    client.release();
  }
});

// ── GET /facturas/:id ─────────────────────────────────────────────────────────
// Una factura con sus renglones, para editarla.

router.get('/facturas/:id', requireAuth, soloEncargado, async (req, res) => {
  try {
    const { rows } = await pool.query(`${SELECT_FACTURAS} WHERE f.id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Factura no encontrada' });
    const items = (await pool.query(`
      SELECT id, producto, cantidad, unidad, precio_unit FROM facturas_items
      WHERE factura_id = $1 ORDER BY id
    `, [req.params.id])).rows.map(it => ({
      ...it, cantidad: n(it.cantidad), precio_unit: n(it.precio_unit),
    }));
    res.json({ ok: true, data: { ...armarFactura(rows[0]), items } });
  } catch (err) {
    console.error('[proveedores/facturas/:id]', err);
    res.status(500).json({ ok: false, error: 'No se pudo traer la factura' });
  }
});

// ── PUT /facturas/:id ─────────────────────────────────────────────────────────
// El encargado o el dueño corrigen cualquier factura, venga del turno o de a mano:
// proveedor, número, fecha, local, total y renglones. El vencimiento se recalcula
// con el plazo de la ficha. El total no puede quedar por debajo de lo ya pagado.

router.put('/facturas/:id', requireAuth, soloEncargado, async (req, res) => {
  const client = await pool.connect();
  try {
    const { proveedor_id, numero, fecha, total, local_id, items } = req.body;

    if (!proveedor_id) return res.status(400).json({ ok: false, error: 'Elegí el proveedor' });
    if (!local_id)     return res.status(400).json({ ok: false, error: 'Elegí el local' });
    if (!esFecha(fecha)) return res.status(400).json({ ok: false, error: 'Fecha inválida' });
    if (n(total) <= 0) return res.status(400).json({ ok: false, error: 'Falta el total de la factura' });

    const actual = await client.query(`${SELECT_FACTURAS} WHERE f.id = $1`, [req.params.id]);
    if (!actual.rows.length) return res.status(404).json({ ok: false, error: 'Factura no encontrada' });
    const pagado = n(actual.rows[0].pagado);
    if (n(total) < pagado) {
      return res.status(409).json({
        ok: false,
        error: `Esta factura ya tiene ${money(pagado)} pagados: el total no puede ser menor que eso. Si el pago está mal, borralo desde Pagos hechos.`,
      });
    }

    const prov = await client.query('SELECT nombre, plazo_dias FROM proveedores WHERE id = $1', [proveedor_id]);
    if (!prov.rows.length) return res.status(404).json({ ok: false, error: 'Ese proveedor no existe' });
    const d = new Date(`${fecha}T00:00:00`);
    d.setDate(d.getDate() + prov.rows[0].plazo_dias);
    const vence = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    await client.query('BEGIN');
    await client.query(`
      UPDATE facturas
      SET local_id = $1, proveedor = $2, proveedor_id = $3, numero = $4, fecha = $5, vencimiento = $6, total = $7
      WHERE id = $8
    `, [
      local_id, prov.rows[0].nombre, proveedor_id,
      String(numero || '').trim() || null, fecha, vence, n(total), req.params.id,
    ]);
    await client.query('DELETE FROM facturas_items WHERE factura_id = $1', [req.params.id]);
    for (const it of (items || [])) {
      if (!it.producto?.trim()) continue;
      await client.query(`
        INSERT INTO facturas_items (factura_id, producto, cantidad, unidad, precio_unit)
        VALUES ($1,$2,$3,$4,$5)
      `, [req.params.id, it.producto.trim(), n(it.cantidad) || 1, unidadValida(it.unidad), n(it.precio_unit)]);
    }
    await client.query('COMMIT');

    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[proveedores/facturas PUT]', err);
    res.status(500).json({ ok: false, error: 'No se pudo guardar la factura' });
  } finally {
    client.release();
  }
});

// ── DELETE /facturas/:id ──────────────────────────────────────────────────────
// Una factura con pagos anotados no se borra: primero se borran los pagos desde
// "Pagos hechos", así no desaparece plata que ya salió.

router.delete('/facturas/:id', requireAuth, soloEncargado, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT f.id, (SELECT COUNT(*)::int FROM pagos_proveedor pg WHERE pg.factura_id = f.id) AS pagos
      FROM facturas f WHERE f.id = $1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Factura no encontrada' });
    if (rows[0].pagos > 0) {
      return res.status(409).json({
        ok: false,
        error: `Esta factura tiene ${rows[0].pagos} pago${rows[0].pagos === 1 ? '' : 's'} anotado${rows[0].pagos === 1 ? '' : 's'}. Borralos primero desde Pagos hechos.`,
      });
    }
    await pool.query('DELETE FROM facturas WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[proveedores/facturas DELETE]', err);
    res.status(500).json({ ok: false, error: 'No se pudo borrar la factura' });
  }
});

// ── GET /plan ─────────────────────────────────────────────────────────────────
// "Todo lo que debo de facturas hasta tal día": las facturas con fecha hasta esa
// (por fecha de la factura, no por vencimiento) que todavía tienen saldo, agrupadas
// por proveedor. El dueño no quiere que el vencimiento entre en esta cuenta.

router.get('/plan', requireAuth, soloEncargado, async (req, res) => {
  try {
    const hoy   = hoyStr();
    const hasta = esFecha(req.query.hasta) ? req.query.hasta : hoy;

    const { rows } = await pool.query(
      `${SELECT_FACTURAS} WHERE f.fecha <= $1::date ORDER BY f.fecha, f.id`, [hasta]
    );
    const facturas = rows.map(armarFactura).filter(f => f.saldo > 0);

    const porProveedor = new Map();
    for (const f of facturas) {
      const clave = f.proveedor_id || `texto:${f.proveedor}`;
      if (!porProveedor.has(clave)) {
        porProveedor.set(clave, {
          proveedor_id: f.proveedor_id,
          proveedor: f.proveedor,
          medio_pago: f.medio_pago,
          dias_pago: f.dias_pago,
          proximo_dia_pago: proximoDiaPago(f.dias_pago, hoy),
          total: 0,
          facturas: [],
        });
      }
      const g = porProveedor.get(clave);
      g.total += f.saldo;
      g.facturas.push(f);
    }

    const grupos = [...porProveedor.values()].sort((a, b) => b.total - a.total);

    res.json({
      ok: true,
      data: {
        hasta,
        grupos,
        total: grupos.reduce((s, g) => s + g.total, 0),
        cantidad: facturas.length,
      },
    });
  } catch (err) {
    console.error('[proveedores/plan]', err);
    res.status(500).json({ ok: false, error: 'No se pudo armar el plan de pagos' });
  }
});

// ── GET /pagos ────────────────────────────────────────────────────────────────

router.get('/pagos', requireAuth, soloEncargado, async (req, res) => {
  try {
    const desde = esFecha(req.query.desde) ? req.query.desde : null;
    const hasta = esFecha(req.query.hasta) ? req.query.hasta : null;

    const { rows } = await pool.query(`
      SELECT pg.id, pg.fecha::text AS fecha, pg.monto, pg.medio, pg.comprobante, pg.nota,
             f.numero AS factura_numero, f.id AS factura_id,
             COALESCE(p.nombre, f.proveedor) AS proveedor,
             u.nombre AS anotado_por
      FROM pagos_proveedor pg
      JOIN facturas    f ON f.id = pg.factura_id
      LEFT JOIN proveedores p ON p.id = f.proveedor_id
      JOIN usuarios    u ON u.id = pg.usuario_id
      WHERE ($1::date IS NULL OR pg.fecha >= $1::date)
        AND ($2::date IS NULL OR pg.fecha <= $2::date)
      ORDER BY pg.fecha DESC, pg.id DESC
      LIMIT 300
    `, [desde, hasta]);

    res.json({ ok: true, data: rows.map(r => ({ ...r, monto: n(r.monto) })) });
  } catch (err) {
    console.error('[proveedores/pagos GET]', err);
    res.status(500).json({ ok: false, error: 'No se pudieron traer los pagos' });
  }
});

// ── POST /pagos ───────────────────────────────────────────────────────────────
// Uno o varios de una vez: desde el plan se anotan todos los elegidos juntos, y o
// entran todos o no entra ninguno.

router.post('/pagos', requireAuth, soloEncargado, async (req, res) => {
  const entrada = Array.isArray(req.body.pagos) ? req.body.pagos : [req.body];
  if (!entrada.length) return res.status(400).json({ ok: false, error: 'No mandaste ningún pago' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hechos = [];

    for (const p of entrada) {
      const monto = n(p.monto);
      if (monto <= 0) throw Object.assign(new Error('El monto tiene que ser mayor a cero'), { publico: true });

      const medio = String(p.medio || '');
      if (!MEDIOS.includes(medio)) throw Object.assign(new Error('Esa forma de pago no existe'), { publico: true });

      const fecha = esFecha(p.fecha) ? p.fecha : hoyStr();

      // El saldo se relee acá adentro: entre que el encargado abrió la pantalla y
      // apretó guardar, alguien pudo haber anotado otro pago de la misma factura.
      const f = await client.query(`
        SELECT f.id, f.numero, f.total,
               COALESCE((SELECT SUM(monto) FROM pagos_proveedor WHERE factura_id = f.id), 0) AS pagado,
               COALESCE(pr.nombre, f.proveedor) AS proveedor
        FROM facturas f
        LEFT JOIN proveedores pr ON pr.id = f.proveedor_id
        WHERE f.id = $1
        FOR UPDATE OF f
      `, [p.factura_id]);

      if (!f.rows.length) throw Object.assign(new Error('Esa factura no existe'), { publico: true });

      const saldo = n(f.rows[0].total) - n(f.rows[0].pagado);
      if (monto > saldo + 0.01) {
        throw Object.assign(
          new Error(`${f.rows[0].proveedor}: el pago es mayor que el saldo de la factura`),
          { publico: true }
        );
      }

      const ins = await client.query(`
        INSERT INTO pagos_proveedor (factura_id, fecha, monto, medio, comprobante, nota, usuario_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id
      `, [
        f.rows[0].id, fecha, monto, medio,
        String(p.comprobante || '').trim() || null,
        String(p.nota || '').trim() || null,
        req.user.id,
      ]);

      hechos.push({
        id: ins.rows[0].id,
        factura_id: f.rows[0].id,
        proveedor: f.rows[0].proveedor,
        monto,
        saldado: monto >= saldo - 0.01,
      });
    }

    await client.query('COMMIT');
    res.status(201).json({ ok: true, data: hechos });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.publico) return res.status(400).json({ ok: false, error: err.message });
    console.error('[proveedores/pagos POST]', err);
    res.status(500).json({ ok: false, error: 'No se pudo anotar el pago' });
  } finally {
    client.release();
  }
});

// ── DELETE /pagos/:id ─────────────────────────────────────────────────────────
// Para cuando se anotó con el medio equivocado: se borra y se vuelve a anotar.

router.delete('/pagos/:id', requireAuth, soloEncargado, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM pagos_proveedor WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ ok: false, error: 'Ese pago no existe' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[proveedores/pagos DELETE]', err);
    res.status(500).json({ ok: false, error: 'No se pudo borrar el pago' });
  }
});

module.exports = router;
