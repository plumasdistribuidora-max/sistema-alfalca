'use strict';

const express = require('express');
const pool    = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const TZ = 'America/Argentina/Mendoza';

// Ajuste por caída de consumo del mercado (~-12% anualizado confirmado)
const FACTOR_TENDENCIA = 0.97;

const MULTIPLICADORES = { normal: 1.0, sube: 1.2, finde_largo: 1.6 };
const MESES_NOMBRES   = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const SEMANAS_MINIMAS = 4;

function n(v) { return Number(v) || 0; }

async function calcularVelocidadBase(localId) {
  const semRes = await pool.query(`
    SELECT
      DATE_TRUNC('week', (vi.fecha_creacion AT TIME ZONE '${TZ}')::date) AS semana,
      SUM(vi.docenas_equivalentes) AS docenas
    FROM ventas_items vi
    WHERE vi.local_id = $1
      AND NOT vi.cancelada
      AND DATE(vi.fecha_creacion AT TIME ZONE '${TZ}') >= (CURRENT_DATE - INTERVAL '70 days')
      AND DATE_TRUNC('week', (vi.fecha_creacion AT TIME ZONE '${TZ}')::date) < DATE_TRUNC('week', CURRENT_DATE)
    GROUP BY semana
    ORDER BY semana DESC
    LIMIT 10
  `, [localId]);

  if (semRes.rows.length >= SEMANAS_MINIMAS) {
    let sumPeso = 0, sumVal = 0;
    semRes.rows.forEach((row, idx) => {
      const peso = Math.pow(0.8, idx);
      sumPeso += peso;
      sumVal  += n(row.docenas) * peso;
    });
    return {
      velocidad: sumVal / sumPeso,
      fuente: 'local',
      semanas: semRes.rows.length,
    };
  }

  // Insuficiente historia → promedio ponderado de la red (alfajoreras)
  const redRes = await pool.query(`
    SELECT
      DATE_TRUNC('week', (vi.fecha_creacion AT TIME ZONE '${TZ}')::date) AS semana,
      SUM(vi.docenas_equivalentes) AS docenas
    FROM ventas_items vi
    JOIN locales l ON l.id = vi.local_id AND l.es_alfajorera = true AND l.activo = true
    WHERE NOT vi.cancelada
      AND DATE(vi.fecha_creacion AT TIME ZONE '${TZ}') >= (CURRENT_DATE - INTERVAL '70 days')
      AND DATE_TRUNC('week', (vi.fecha_creacion AT TIME ZONE '${TZ}')::date) < DATE_TRUNC('week', CURRENT_DATE)
    GROUP BY semana
    ORDER BY semana DESC
    LIMIT 10
  `);

  let sumPeso = 0, sumVal = 0;
  redRes.rows.forEach((row, idx) => {
    const peso = Math.pow(0.8, idx);
    sumPeso += peso;
    sumVal  += n(row.docenas) * peso;
  });
  return {
    velocidad: sumPeso > 0 ? sumVal / sumPeso : 0,
    fuente: 'red',
    semanas: semRes.rows.length,
  };
}

async function calcularFactorEstacional(dias) {
  const hoy         = new Date();
  const mesActual   = hoy.getMonth() + 1;
  const diaFin      = new Date(hoy.getTime() + dias * 24 * 60 * 60 * 1000);
  const mesObjetivo = diaFin.getMonth() + 1;

  const r = await pool.query(
    'SELECT mes, indice FROM estacionalidad_mensual WHERE mes = ANY($1::int[])',
    [[mesActual, mesObjetivo]]
  );
  const m = Object.fromEntries(r.rows.map(row => [Number(row.mes), Number(row.indice)]));

  const iActual   = m[mesActual]   ?? 1;
  const iObjetivo = m[mesObjetivo] ?? 1;

  return {
    mesActual,
    mesObjetivo,
    indice_mes_actual:   iActual,
    indice_mes_objetivo: iObjetivo,
    factor:              iActual > 0 ? iObjetivo / iActual : 1,
  };
}

// ── GET /variedades ───────────────────────────────────────────────────────────

router.get('/variedades', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, nombre, mix_pct, doc_por_bulto FROM variedades_alfajor WHERE activo = true ORDER BY mix_pct DESC, orden ASC'
    );
    res.json({
      ok: true,
      data: r.rows.map(v => ({
        id:            v.id,
        nombre:        v.nombre,
        mix_pct:       Number(v.mix_pct),
        doc_por_bulto: Number(v.doc_por_bulto),
      })),
    });
  } catch (err) {
    console.error('[stock/variedades]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /proyeccion ───────────────────────────────────────────────────────────

router.get('/proyeccion', requireAuth, async (req, res) => {
  try {
    const localId  = parseInt(req.query.local_id);
    const dias     = parseInt(req.query.dias) || 7;
    const situacion = req.query.situacion || 'normal';

    if (!localId || isNaN(localId))
      return res.status(400).json({ ok: false, error: 'local_id requerido' });
    if (dias < 1 || dias > 60)
      return res.status(400).json({ ok: false, error: 'dias debe estar entre 1 y 60' });

    const multiplicador = MULTIPLICADORES[situacion] ?? 1.0;

    const [localRes, vel, estac, varRes, todosEstacRes] = await Promise.all([
      pool.query('SELECT id, nombre FROM locales WHERE id = $1 AND activo = true', [localId]),
      calcularVelocidadBase(localId),
      calcularFactorEstacional(dias),
      pool.query(
        'SELECT id, nombre, mix_pct, doc_por_bulto FROM variedades_alfajor WHERE activo = true ORDER BY mix_pct DESC, orden ASC'
      ),
      pool.query('SELECT mes, indice FROM estacionalidad_mensual ORDER BY mes'),
    ]);

    if (!localRes.rows.length)
      return res.status(404).json({ ok: false, error: 'Local no encontrado' });

    const demanda_total_doc = vel.velocidad * (dias / 7) * estac.factor * FACTOR_TENDENCIA * multiplicador;

    const variedades = varRes.rows.map(v => {
      const demanda_doc    = demanda_total_doc * Number(v.mix_pct) / 100;
      const demanda_bultos = Number(v.doc_por_bulto) > 0 ? demanda_doc / Number(v.doc_por_bulto) : 0;
      return {
        id:             v.id,
        nombre:         v.nombre,
        mix_pct:        Number(v.mix_pct),
        doc_por_bulto:  Number(v.doc_por_bulto),
        demanda_doc:    Math.round(demanda_doc * 100) / 100,
        demanda_bultos: Math.round(demanda_bultos * 100) / 100,
      };
    });

    const grafico_estacionalidad = todosEstacRes.rows.map(r => ({
      mes:    Number(r.mes),
      nombre: MESES_NOMBRES[Number(r.mes) - 1],
      indice: Number(r.indice),
    }));

    res.json({
      ok: true,
      data: {
        local: { id: localRes.rows[0].id, nombre: localRes.rows[0].nombre },
        parametros: {
          dias,
          situacion,
          multiplicador,
          mes_actual:   estac.mesActual,
          mes_objetivo: estac.mesObjetivo,
        },
        factores: {
          velocidad_base_semanal: Math.round(vel.velocidad * 100) / 100,
          fuente_velocidad:       vel.fuente,
          semanas_historia:       vel.semanas,
          factor_estacional:      Math.round(estac.factor * 1000) / 1000,
          indice_mes_actual:      estac.indice_mes_actual,
          indice_mes_objetivo:    estac.indice_mes_objetivo,
          factor_tendencia:       FACTOR_TENDENCIA,
          multiplicador,
        },
        demanda_total_doc: Math.round(demanda_total_doc * 100) / 100,
        variedades,
        grafico_estacionalidad,
      },
    });
  } catch (err) {
    console.error('[stock/proyeccion]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /calcular-pedido ─────────────────────────────────────────────────────

router.post('/calcular-pedido', requireAuth, async (req, res) => {
  try {
    const { local_id, dias, situacion, unidad, conteos } = req.body;

    if (!local_id || !dias || !Array.isArray(conteos) || !conteos.length)
      return res.status(400).json({ ok: false, error: 'local_id, dias y conteos requeridos' });
    if (!['bultos', 'docenas'].includes(unidad))
      return res.status(400).json({ ok: false, error: "unidad debe ser 'bultos' o 'docenas'" });

    const multiplicador = MULTIPLICADORES[situacion] || 1.0;

    const [vel, estac, varRes] = await Promise.all([
      calcularVelocidadBase(local_id),
      calcularFactorEstacional(dias),
      pool.query(
        'SELECT id, nombre, mix_pct, doc_por_bulto FROM variedades_alfajor WHERE activo = true ORDER BY mix_pct DESC, orden ASC'
      ),
    ]);

    const demanda_total_doc = vel.velocidad * (dias / 7) * estac.factor * FACTOR_TENDENCIA * multiplicador;

    const conteoMap = Object.fromEntries(conteos.map(c => [Number(c.variedad_id), n(c.contado)]));

    const variedades = varRes.rows.map(v => {
      const dpb        = Number(v.doc_por_bulto);
      const contado    = conteoMap[v.id] ?? 0;
      const stock_doc  = unidad === 'bultos' ? contado * dpb : contado;
      const demanda_doc = demanda_total_doc * Number(v.mix_pct) / 100;
      const a_pedir_doc = Math.max(0, demanda_doc - stock_doc);
      const a_pedir_bultos = dpb > 0 ? Math.ceil(a_pedir_doc / dpb) : 0;

      let alerta = 'ok';
      if (stock_doc < demanda_doc * 0.3)      alerta = 'quiebre';
      else if (stock_doc < demanda_doc * 0.6) alerta = 'bajo';

      return {
        variedad_id:   v.id,
        nombre:        v.nombre,
        mix_pct:       Number(v.mix_pct),
        doc_por_bulto: dpb,
        contado,
        stock_doc:     Math.round(stock_doc * 100) / 100,
        demanda_doc:   Math.round(demanda_doc * 100) / 100,
        a_pedir_doc:   Math.round(a_pedir_doc * 100) / 100,
        a_pedir_bultos,
        alerta,
      };
    });

    const usuario = req.user?.email || req.user?.nombre || 'sistema';
    const insertRes = await pool.query(`
      INSERT INTO stock_conteos (local_id, dias_cubrir, multiplicador, unidad, usuario, detalle)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, created_at
    `, [local_id, dias, multiplicador, unidad, usuario, JSON.stringify(variedades)]);

    const conteo_id = insertRes.rows[0].id;

    const totales = {
      demanda_total_doc:    Math.round(demanda_total_doc * 100) / 100,
      a_pedir_total_doc:    Math.round(variedades.reduce((s, d) => s + d.a_pedir_doc, 0) * 100) / 100,
      a_pedir_total_bultos: variedades.reduce((s, d) => s + d.a_pedir_bultos, 0),
      quiebres: variedades.filter(d => d.alerta === 'quiebre').length,
      bajos:    variedades.filter(d => d.alerta === 'bajo').length,
    };

    res.json({ ok: true, data: { conteo_id, totales, variedades } });
  } catch (err) {
    console.error('[stock/calcular-pedido]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /export ───────────────────────────────────────────────────────────────

router.get('/export', requireAuth, async (req, res) => {
  try {
    const conteo_id = parseInt(req.query.conteo_id);
    if (!conteo_id || isNaN(conteo_id))
      return res.status(400).json({ ok: false, error: 'conteo_id requerido' });

    const r = await pool.query(`
      SELECT sc.*, l.nombre AS local_nombre
      FROM stock_conteos sc
      JOIN locales l ON l.id = sc.local_id
      WHERE sc.id = $1
    `, [conteo_id]);

    if (!r.rows.length)
      return res.status(404).json({ ok: false, error: 'Conteo no encontrado' });

    const { detalle, local_nombre, created_at } = r.rows[0];
    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const num    = v => String(Math.round(Number(v) * 100) / 100).replace('.', ',');

    const header = '﻿Variedad;Mix %;Doc/Bulto;Stock (doc);Demanda (doc);A pedir (doc);A pedir (bultos);Alerta\r\n';
    const rows   = detalle.map(d => [
      escape(d.nombre),
      num(d.mix_pct),
      num(d.doc_por_bulto),
      num(d.stock_doc),
      num(d.demanda_doc),
      num(d.a_pedir_doc),
      d.a_pedir_bultos,
      escape(d.alerta),
    ].join(';'));

    const fecha    = new Date(created_at).toISOString().split('T')[0];
    const filename = `pedido_${local_nombre.replace(/\s+/g, '_')}_${fecha}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(header + rows.join('\r\n'));
  } catch (err) {
    console.error('[stock/export]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
