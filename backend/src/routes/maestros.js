'use strict';

const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const {
  loadMaestro, normalizar, setCache, isLoaded,
} = require('../services/maestroDocenas');

const { controlCafe, detalleCafe } = require('../utils/cafe');

const router = express.Router();

// Recalcula docenas_equivalentes de las ventas ya importadas de un producto.
// Cubre las líneas enlazadas por producto_id y también las que quedaron sin
// enlazar, matcheando por el nombre crudo que mandó el POS.
async function recalcularHistorico(client, prodId, nombreDisplay, docenas) {
  const valor = docenas === null ? 0 : docenas;

  const porId = await client.query(`
    UPDATE ventas_items
    SET docenas_equivalentes = cantidad * $2::numeric
    WHERE producto_id = $1
  `, [prodId, valor]);

  const porNombre = await client.query(`
    UPDATE ventas_items
    SET docenas_equivalentes = cantidad * $2::numeric
    WHERE producto_id IS NULL
      AND btrim(lower(producto_nombre_raw)) = btrim(lower($1))
  `, [nombreDisplay, valor]);

  return porId.rowCount + porNombre.rowCount;
}

// Aplica un valor de docenas a un producto y recalcula su histórico.
async function definirProducto(client, id, docenas, nota, usuario) {
  const valor = docenas === null ? null : Number(docenas);
  if (valor !== null && (!isFinite(valor) || valor < 0)) {
    throw new Error(`Valor de docenas inválido para el producto ${id}`);
  }

  const upd = await client.query(`
    UPDATE productos_catalogo SET
      docenas_por_unidad   = $2,
      docenas_nota         = $3,
      docenas_origen       = CASE WHEN $2::numeric IS NULL THEN NULL ELSE 'manual' END,
      docenas_definido_por = CASE WHEN $2::numeric IS NULL THEN NULL ELSE $4 END,
      docenas_definido_at  = CASE WHEN $2::numeric IS NULL THEN NULL ELSE NOW() END,
      regla_descripcion    = CASE WHEN $2::numeric IS NULL
                                  THEN 'Pendiente de definir'
                                  ELSE 'Definido a mano' END,
      updated_at           = NOW()
    WHERE id = $1
    RETURNING id, nombre_normalizado, nombre_display, docenas_por_unidad
  `, [id, valor, nota || null, usuario]);

  if (!upd.rows.length) throw new Error(`Producto ${id} no encontrado`);
  const p = upd.rows[0];

  const filas = await recalcularHistorico(client, p.id, p.nombre_display, valor);
  setCache(p.nombre_normalizado, p.id, valor);

  return { id: p.id, nombre: p.nombre_display, docenas: valor, ventas_recalculadas: filas };
}

// ── GET /docenas/estado ─────────────────────────────────────────────────────
router.get('/docenas/estado', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)                                          AS productos,
        COUNT(*) FILTER (WHERE docenas_por_unidad IS NULL) AS pendientes,
        COUNT(*) FILTER (WHERE docenas_por_unidad > 0)     AS suman,
        COUNT(*) FILTER (WHERE docenas_por_unidad = 0)     AS no_suman,
        MAX(docenas_definido_at)                           AS ultima_definicion
      FROM productos_catalogo
    `);
    const r = rows[0];
    res.json({
      ok: true,
      loaded: isLoaded(),
      productos:         Number(r.productos),
      pendientes:        Number(r.pendientes),
      suman:             Number(r.suman),
      no_suman:          Number(r.no_suman),
      ultima_definicion: r.ultima_definicion,
    });
  } catch (err) {
    console.error('[maestros/docenas/estado]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /docenas/lista ──────────────────────────────────────────────────────
// Listado completo del maestro. ?estado=pendientes|definidos filtra.
router.get('/docenas/lista', requireAuth, async (req, res) => {
  try {
    const { estado } = req.query;
    const filtro =
      estado === 'pendientes' ? 'WHERE pc.docenas_por_unidad IS NULL' :
      estado === 'definidos'  ? 'WHERE pc.docenas_por_unidad IS NOT NULL' : '';

    const { rows } = await pool.query(`
      WITH ventas AS (
        SELECT producto_id,
               SUM(cantidad) FILTER (WHERE NOT cancelada) AS unidades,
               MAX(fecha_creacion)                        AS ultima_venta
        FROM ventas_items
        WHERE producto_id IS NOT NULL
        GROUP BY producto_id
      )
      SELECT
        pc.id,
        pc.nombre_display,
        pc.categoria,
        pc.docenas_por_unidad,
        pc.docenas_origen,
        pc.docenas_definido_por,
        pc.docenas_definido_at,
        pc.docenas_nota,
        pc.precio_promedio,
        COALESCE(v.unidades, 0) AS unidades_vendidas,
        v.ultima_venta
      FROM productos_catalogo pc
      LEFT JOIN ventas v ON v.producto_id = pc.id
      ${filtro}
      ORDER BY (pc.docenas_por_unidad IS NULL) DESC,
               COALESCE(v.unidades, 0) DESC,
               pc.nombre_display
    `);

    res.json({
      ok: true,
      data: rows.map(r => ({
        id:                r.id,
        nombre:            r.nombre_display,
        categoria:         r.categoria,
        docenas:           r.docenas_por_unidad === null ? null : Number(r.docenas_por_unidad),
        pendiente:         r.docenas_por_unidad === null,
        origen:            r.docenas_origen,
        definido_por:      r.docenas_definido_por,
        definido_at:       r.docenas_definido_at,
        nota:              r.docenas_nota,
        precio_promedio:   r.precio_promedio === null ? null : Number(r.precio_promedio),
        unidades_vendidas: Number(r.unidades_vendidas),
        ultima_venta:      r.ultima_venta,
      })),
    });
  } catch (err) {
    console.error('[maestros/docenas/lista]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── PUT /docenas/:id ────────────────────────────────────────────────────────
// Body: { docenas: number | null, nota?: string }
router.put('/docenas/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'id inválido' });

  const { docenas, nota } = req.body ?? {};
  if (docenas === undefined) {
    return res.status(400).json({ ok: false, error: 'Falta el valor de docenas' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await definirProducto(
      client, id, docenas, nota, req.user?.nombre || req.user?.email || 'admin',
    );
    await client.query('COMMIT');
    res.json({ ok: true, data: r });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[maestros/docenas/put]', err);
    res.status(400).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
});

// ── POST /docenas/bulk ──────────────────────────────────────────────────────
// Asigna el mismo valor a muchos productos de una. Todo o nada.
// Body: { ids: [1,2,3], docenas: number, nota?: string }
//   o:  { categoria: 'Vinos y Espumantes', docenas: number, solo_pendientes?: bool }
//
// Va con dos UPDATE de conjunto en vez de uno por producto: con 900 productos
// la diferencia es de minutos a segundos.
router.post('/docenas/bulk', requireAuth, requireAdmin, async (req, res) => {
  const { ids, categoria, docenas, nota, solo_pendientes = true } = req.body ?? {};

  const valor = Number(docenas);
  if (docenas === undefined || docenas === null || !isFinite(valor) || valor < 0) {
    return res.status(400).json({ ok: false, error: 'Valor de docenas inválido' });
  }

  const porIds = Array.isArray(ids) && ids.length > 0;
  if (!porIds && !categoria) {
    return res.status(400).json({ ok: false, error: 'Indicá una lista de productos o una categoría' });
  }

  // El filtro de destino es el mismo para los dos UPDATE.
  const cond = [];
  const params = [valor, req.user?.nombre || req.user?.email || 'admin', nota || null];
  if (porIds) {
    params.push(ids.map(Number).filter(Boolean));
    cond.push(`pc.id = ANY($${params.length}::int[])`);
  }
  if (categoria) {
    params.push(categoria === '(sin categoría)' ? null : categoria);
    cond.push(`pc.categoria IS NOT DISTINCT FROM $${params.length}`);
  }
  if (solo_pendientes) cond.push('pc.docenas_por_unidad IS NULL');
  const where = cond.join(' AND ');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const upd = await client.query(`
      UPDATE productos_catalogo pc SET
        docenas_por_unidad   = $1::numeric,
        docenas_nota         = $3,
        docenas_origen       = 'manual',
        docenas_definido_por = $2,
        docenas_definido_at  = NOW(),
        regla_descripcion    = 'Definido a mano (masivo)',
        updated_at           = NOW()
      WHERE ${where}
      RETURNING pc.id
    `, params);

    // Recalcula el histórico de todos los productos tocados de una sola pasada.
    const recalc = await client.query(`
      UPDATE ventas_items vi
      SET docenas_equivalentes = vi.cantidad * $1::numeric
      WHERE vi.producto_id = ANY($2::int[])
        AND vi.docenas_equivalentes IS DISTINCT FROM vi.cantidad * $1::numeric
    `, [valor, upd.rows.map(r => r.id)]);

    await client.query('COMMIT');
    await loadMaestro();

    res.json({
      ok: true,
      actualizados:        upd.rowCount,
      ventas_recalculadas: recalc.rowCount,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[maestros/docenas/bulk]', err);
    res.status(400).json({ ok: false, error: err.message });
  } finally {
    client.release();
  }
});

// ── GET /docenas/categorias ─────────────────────────────────────────────────
// Categorías con su conteo de pendientes, para la carga masiva.
router.get('/docenas/categorias', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT COALESCE(categoria, '(sin categoría)') AS categoria,
             COUNT(*)                                        AS total,
             COUNT(*) FILTER (WHERE docenas_por_unidad IS NULL) AS pendientes
      FROM productos_catalogo
      GROUP BY 1
      ORDER BY COUNT(*) FILTER (WHERE docenas_por_unidad IS NULL) DESC, 1
    `);
    res.json({
      ok: true,
      data: rows.map(r => ({
        categoria:  r.categoria,
        total:      Number(r.total),
        pendientes: Number(r.pendientes),
      })),
    });
  } catch (err) {
    console.error('[maestros/docenas/categorias]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /docenas/export ─────────────────────────────────────────────────────
// CSV del maestro completo, para revisar fuera del sistema.
router.get('/docenas/export', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT nombre_display, categoria, docenas_por_unidad,
             docenas_origen, docenas_definido_por, docenas_definido_at, docenas_nota
      FROM productos_catalogo
      ORDER BY (docenas_por_unidad IS NULL) DESC, nombre_display
    `);

    const esc = v => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const lineas = [
      'Producto;Categoria;Docenas;Estado;Origen;Definido por;Definido el;Nota',
      ...rows.map(r => [
        esc(r.nombre_display),
        esc(r.categoria),
        r.docenas_por_unidad === null ? '' : esc(r.docenas_por_unidad),
        r.docenas_por_unidad === null ? 'PENDIENTE' : 'Definido',
        esc(r.docenas_origen),
        esc(r.docenas_definido_por),
        esc(r.docenas_definido_at ? new Date(r.docenas_definido_at).toISOString().slice(0, 10) : ''),
        esc(r.docenas_nota),
      ].join(';')),
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="maestro-docenas.csv"');
    res.send('﻿' + lineas.join('\n'));
  } catch (err) {
    console.error('[maestros/docenas/export]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /docenas/reload ────────────────────────────────────────────────────
router.post('/docenas/reload', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await loadMaestro();
    res.json({ ok: true, mensaje: 'Maestro recargado desde la base', ...result });
  } catch (err) {
    console.error('[maestros/docenas/reload]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /docenas/recalcular ────────────────────────────────────────────────
// Reaplica todos los valores del maestro sobre las ventas ya importadas.
//
// Ojo: los productos pendientes valen 0. Si se corre esto con pendientes
// encima, todas sus ventas históricas se ponen en 0 de golpe y los totales se
// desploman. Por eso se bloquea mientras quede alguno sin definir.
router.post('/docenas/recalcular', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows: [c] } = await pool.query(
      'SELECT COUNT(*) AS pendientes FROM productos_catalogo WHERE docenas_por_unidad IS NULL'
    );
    const pendientes = Number(c.pendientes);
    if (pendientes > 0 && req.body?.forzar !== true) {
      return res.status(409).json({
        ok: false,
        pendientes,
        error: `Quedan ${pendientes} productos sin definir. Como los pendientes valen 0, ` +
               'recalcular ahora pondría en cero sus ventas históricas. Definilos primero.',
      });
    }

    const r = await pool.query(`
      UPDATE ventas_items vi
      SET docenas_equivalentes = vi.cantidad * COALESCE(pc.docenas_por_unidad, 0)
      FROM productos_catalogo pc
      WHERE pc.id = vi.producto_id
        AND vi.docenas_equivalentes IS DISTINCT FROM vi.cantidad * COALESCE(pc.docenas_por_unidad, 0)
    `);
    await loadMaestro();
    res.json({ ok: true, ventas_recalculadas: r.rowCount });
  } catch (err) {
    console.error('[maestros/docenas/recalcular]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// Maestro de café: gramos de café por producto de la cafetería. Mismos tres
// estados que las docenas (NULL pendiente, 0 no lleva, > 0 gramos). Solo entran
// los productos que alguna vez se vendieron en el local de tipo cafetería.
// ═══════════════════════════════════════════════════════════════════════════

const EN_CAFE = `EXISTS (
  SELECT 1 FROM ventas_items vi JOIN locales l ON l.id = vi.local_id
  WHERE vi.producto_id = pc.id AND l.tipo = 'cafeteria'
)`;

router.get('/cafe/estado', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT COUNT(*)                                     AS productos,
             COUNT(*) FILTER (WHERE cafe_gramos IS NULL)  AS pendientes,
             COUNT(*) FILTER (WHERE cafe_gramos > 0)      AS llevan,
             COUNT(*) FILTER (WHERE cafe_gramos = 0)      AS no_llevan
      FROM productos_catalogo pc WHERE ${EN_CAFE}
    `);
    const r = rows[0];
    res.json({ ok: true, productos: +r.productos, pendientes: +r.pendientes, llevan: +r.llevan, no_llevan: +r.no_llevan });
  } catch (err) {
    console.error('[maestros/cafe/estado]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/cafe/lista', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      WITH ventas AS (
        SELECT vi.producto_id,
               SUM(vi.cantidad) FILTER (WHERE NOT COALESCE(vi.cancelada, false)) AS unidades,
               SUM(vi.cantidad) FILTER (WHERE NOT COALESCE(vi.cancelada, false) AND vi.fecha_creacion >= NOW() - INTERVAL '90 days') AS unidades_90,
               MAX(vi.fecha_creacion) AS ultima_venta
        FROM ventas_items vi JOIN locales l ON l.id = vi.local_id
        WHERE l.tipo = 'cafeteria' AND vi.producto_id IS NOT NULL
        GROUP BY vi.producto_id
      )
      SELECT pc.id, pc.nombre_display, pc.categoria, pc.cafe_gramos, pc.cafe_definido_por, pc.cafe_definido_at,
             COALESCE(v.unidades, 0) AS unidades_vendidas, COALESCE(v.unidades_90, 0) AS unidades_90, v.ultima_venta
      FROM productos_catalogo pc
      JOIN ventas v ON v.producto_id = pc.id
      ORDER BY (pc.cafe_gramos IS NULL) DESC, COALESCE(v.unidades_90, 0) DESC, pc.nombre_display
    `);
    res.json({
      ok: true,
      data: rows.map(r => ({
        id: r.id, nombre: r.nombre_display, categoria: r.categoria,
        gramos: r.cafe_gramos === null ? null : Number(r.cafe_gramos),
        pendiente: r.cafe_gramos === null,
        definido_por: r.cafe_definido_por, definido_at: r.cafe_definido_at,
        unidades_vendidas: Number(r.unidades_vendidas), unidades_90: Number(r.unidades_90),
        ultima_venta: r.ultima_venta,
      })),
    });
  } catch (err) {
    console.error('[maestros/cafe/lista]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

function gramosValidos(g) {
  const v = Number(g);
  return g !== undefined && g !== null && g !== '' && isFinite(v) && v >= 0 ? v : null;
}

// PUT /cafe/:id  { gramos }
router.put('/cafe/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const v = gramosValidos(req.body?.gramos);
  if (!id || v === null) return res.status(400).json({ ok: false, error: 'Ingresá los gramos (0 si no lleva café)' });
  try {
    const { rows } = await pool.query(`
      UPDATE productos_catalogo SET cafe_gramos = $2, cafe_definido_por = $3, cafe_definido_at = NOW(), updated_at = NOW()
      WHERE id = $1 RETURNING id, nombre_display, cafe_gramos
    `, [id, v, req.user?.nombre || req.user?.email || 'admin']);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
    res.json({ ok: true, data: { id: rows[0].id, nombre: rows[0].nombre_display, gramos: Number(rows[0].cafe_gramos) } });
  } catch (err) {
    console.error('[maestros/cafe/put]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /cafe/bulk  { ids, gramos }
router.post('/cafe/bulk', requireAuth, requireAdmin, async (req, res) => {
  const { ids, gramos } = req.body ?? {};
  const v = gramosValidos(gramos);
  if (!Array.isArray(ids) || !ids.length || v === null) {
    return res.status(400).json({ ok: false, error: 'Elegí productos y un valor en gramos' });
  }
  try {
    const upd = await pool.query(`
      UPDATE productos_catalogo SET cafe_gramos = $1, cafe_definido_por = $2, cafe_definido_at = NOW(), updated_at = NOW()
      WHERE id = ANY($3::int[])
    `, [v, req.user?.nombre || req.user?.email || 'admin', ids.map(Number).filter(Boolean)]);
    res.json({ ok: true, actualizados: upd.rowCount });
  } catch (err) {
    console.error('[maestros/cafe/bulk]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /cafe/control?desde&hasta — lo pesado por los baristas contra lo teórico de las ventas.
router.get('/cafe/control', requireAuth, async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde || '') || !/^\d{4}-\d{2}-\d{2}$/.test(hasta || '')) {
      return res.status(400).json({ ok: false, error: 'Fechas inválidas' });
    }
    res.json({ ok: true, data: await controlCafe(desde, hasta) });
  } catch (err) {
    console.error('[maestros/cafe/control]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /cafe/detalle?fecha — el teórico de un día abierto por producto.
router.get('/cafe/detalle', requireAuth, async (req, res) => {
  try {
    const { fecha } = req.query;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return res.status(400).json({ ok: false, error: 'Fecha inválida' });
    res.json({ ok: true, data: await detalleCafe(fecha) });
  } catch (err) {
    console.error('[maestros/cafe/detalle]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
