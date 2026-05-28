'use strict';

const express = require('express');
const multer  = require('multer');
const xlsx    = require('xlsx');
const pool    = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── Helpers ───────────────────────────────────────────────────────────────────

function n(v) { return Number(v) || 0; }

function parseExcelDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val) ? null : val;
  if (typeof val === 'number') return new Date(Math.round((val - 25569) * 86400 * 1000));
  if (typeof val === 'string' && val.trim()) {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function normalizeKey(k) {
  return k.toString()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toDateStr(d) {
  if (!d) return null;
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return null;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

const CUENTAS = ['santander', 'mp', 'galicia', 'efectivo'];

function categorizarEstado(estado) {
  if (!estado) return 'no_cuenta';
  const s = normalizeKey(estado);
  if (s === 'pagado') return 'pagado';
  if (['rechazado', 'repudiado', 'anulado'].includes(s)) return 'no_cuenta';
  return 'pendiente';
}

// ── GET /saldos ───────────────────────────────────────────────────────────────

router.get('/saldos', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (cuenta)
        cuenta, monto, fecha_actualizacion
      FROM cuentas_saldos
      ORDER BY cuenta, fecha_actualizacion DESC
    `);

    const byCuenta = {};
    for (const r of rows) byCuenta[r.cuenta] = { monto: n(r.monto), fecha: r.fecha_actualizacion };

    let total = 0;
    const saldos = {};
    for (const c of CUENTAS) {
      saldos[c] = byCuenta[c] || { monto: 0, fecha: null };
      total += saldos[c].monto;
    }

    const ef = saldos.efectivo;
    let efectivo_dias = null;
    let efectivo_warning = false;
    if (ef.fecha) {
      const diff = Date.now() - new Date(ef.fecha).getTime();
      efectivo_dias = Math.floor(diff / (1000 * 60 * 60 * 24));
      efectivo_warning = efectivo_dias > 3;
    } else {
      efectivo_warning = true;
    }

    res.json({ ok: true, data: { saldos, total, efectivo_dias, efectivo_warning } });
  } catch (err) {
    console.error('[cashflow/saldos GET]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /saldos ──────────────────────────────────────────────────────────────

router.post('/saldos', requireAuth, async (req, res) => {
  try {
    const { cuenta, monto } = req.body;
    if (!cuenta || !CUENTAS.includes(cuenta)) {
      return res.status(400).json({ ok: false, error: `cuenta inválida. Opciones: ${CUENTAS.join(', ')}` });
    }
    if (monto == null) return res.status(400).json({ ok: false, error: 'monto requerido' });

    await pool.query(
      'INSERT INTO cuentas_saldos (cuenta, monto) VALUES ($1, $2)',
      [cuenta, parseFloat(monto)]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[cashflow/saldos POST]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /cheques/import ──────────────────────────────────────────────────────

router.post('/cheques/import', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'No se recibió archivo' });

  try {
    const wb = xlsx.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const wsName = wb.SheetNames[0];
    const ws = wb.Sheets[wsName];

    // Header en fila 2 (índice 1), datos desde fila 3 (índice 2)
    const raw = xlsx.utils.sheet_to_json(ws, { range: 1, defval: null });

    let importados = 0, actualizados = 0, errores = 0;

    for (const row of raw) {
      const norm = {};
      for (const [k, v] of Object.entries(row)) norm[normalizeKey(k)] = v;

      const nroRaw = norm['n de cheque'];
      if (nroRaw == null || String(nroRaw).trim() === '') { errores++; continue; }
      const nroStr = String(nroRaw).trim();

      const emitidoA     = norm['emitido a']      ? String(norm['emitido a']).trim()      : null;
      const fechaPago    = parseExcelDate(norm['fecha de pago']);
      const fechaEmision = parseExcelDate(norm['fecha de emision']);
      const importe      = parseFloat(norm['importe'])  || null;
      const estado       = norm['estado']          ? String(norm['estado']).trim()          : null;

      try {
        const r = await pool.query(`
          INSERT INTO cheques_galicia (nro_cheque, emitido_a, fecha_pago, fecha_emision, importe, estado, raw, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,NOW())
          ON CONFLICT (nro_cheque) DO UPDATE SET
            emitido_a     = EXCLUDED.emitido_a,
            fecha_pago    = EXCLUDED.fecha_pago,
            fecha_emision = EXCLUDED.fecha_emision,
            importe       = EXCLUDED.importe,
            estado        = EXCLUDED.estado,
            raw           = EXCLUDED.raw,
            updated_at    = NOW()
          RETURNING (xmax = 0) AS inserted
        `, [
          nroStr, emitidoA,
          toDateStr(fechaPago), toDateStr(fechaEmision),
          importe, estado,
          JSON.stringify(norm),
        ]);
        if (r.rows[0]?.inserted) importados++; else actualizados++;
      } catch {
        errores++;
      }
    }

    res.json({ ok: true, data: { importados, actualizados, errores, total: raw.length } });
  } catch (err) {
    console.error('[cashflow/cheques/import]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /calendario ───────────────────────────────────────────────────────────

router.get('/calendario', requireAuth, async (req, res) => {
  try {
    const { mes } = req.query;
    if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
      return res.status(400).json({ ok: false, error: 'mes (YYYY-MM) requerido' });
    }

    const today = todayStr();
    const [y, m]   = mes.split('-').map(Number);
    const iniMes   = `${mes}-01`;
    const finMes   = `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;

    // Saldo total actual
    const saldoRes = await pool.query(`
      SELECT DISTINCT ON (cuenta) cuenta, monto
      FROM cuentas_saldos
      ORDER BY cuenta, fecha_actualizacion DESC
    `);
    const saldoTotal = saldoRes.rows.reduce((s, r) => s + n(r.monto), 0);

    // Todos los cheques
    const chequesRes = await pool.query(`
      SELECT id, nro_cheque, emitido_a, fecha_pago, fecha_emision, importe, estado
      FROM cheques_galicia
    `);

    // Gastos del mes
    const gastosRes = await pool.query(`
      SELECT id, concepto, monto, fecha
      FROM gastos_manuales
      WHERE fecha BETWEEN $1 AND $2
    `, [iniMes, finMes]);

    // Todos los gastos desde hoy (para alcanza_hasta)
    const gastosAllRes = await pool.query(`
      SELECT fecha, monto FROM gastos_manuales WHERE fecha >= $1
    `, [today]);

    // Construir egresos del mes con lógica de arrastre
    const egresos = [];
    const daily = {}; // para calcular alcanza_hasta

    for (const c of chequesRes.rows) {
      const cat = categorizarEstado(c.estado);
      if (cat === 'no_cuenta') continue;

      const fechaPagoStr = toDateStr(c.fecha_pago);
      if (!fechaPagoStr) continue;

      let displayDate;
      let arrastrado = false;

      if (cat === 'pagado') {
        displayDate = fechaPagoStr;
      } else {
        // pendiente
        if (fechaPagoStr <= today) {
          displayDate = today;
          arrastrado = fechaPagoStr < today;
        } else {
          displayDate = fechaPagoStr;
        }
        // Acumular para alcanza_hasta (solo pendientes)
        daily[displayDate] = (daily[displayDate] || 0) + n(c.importe);
      }

      // Solo agregar al mes visible si display_date cae en ese mes
      if (displayDate >= iniMes && displayDate <= finMes) {
        egresos.push({
          tipo: 'cheque',
          fecha: displayDate,
          nro_cheque: c.nro_cheque,
          emitido_a: c.emitido_a,
          importe: n(c.importe),
          estado: c.estado,
          estado_categoria: cat,
          arrastrado,
          fecha_pago_original: fechaPagoStr,
        });
      }
    }

    for (const g of gastosRes.rows) {
      const f = toDateStr(g.fecha);
      if (!f) continue;
      egresos.push({
        tipo: 'gasto',
        fecha: f,
        id: g.id,
        concepto: g.concepto,
        importe: n(g.monto),
      });
    }

    // Gastos futuros → alcanza_hasta
    for (const g of gastosAllRes.rows) {
      const d = toDateStr(g.fecha);
      if (!d || d < today) continue;
      daily[d] = (daily[d] || 0) + n(g.monto);
    }

    let saldo = saldoTotal;
    let alcanza_hasta = null;
    for (const d of Object.keys(daily).sort()) {
      saldo -= daily[d];
      if (saldo < 0 && !alcanza_hasta) { alcanza_hasta = d; break; }
    }

    res.json({
      ok: true,
      data: { mes, saldo_total: saldoTotal, alcanza_hasta, egresos },
    });
  } catch (err) {
    console.error('[cashflow/calendario]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Gastos manuales CRUD ──────────────────────────────────────────────────────

router.post('/gastos', requireAuth, async (req, res) => {
  try {
    const { concepto, monto, fecha } = req.body;
    if (!concepto || monto == null || !fecha) {
      return res.status(400).json({ ok: false, error: 'concepto, monto y fecha requeridos' });
    }
    const { rows } = await pool.query(
      'INSERT INTO gastos_manuales (concepto, monto, fecha) VALUES ($1,$2,$3) RETURNING *',
      [concepto.trim(), parseFloat(monto), fecha]
    );
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error('[cashflow/gastos POST]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/gastos/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { concepto, monto, fecha } = req.body;
    const { rows } = await pool.query(
      'UPDATE gastos_manuales SET concepto=$1, monto=$2, fecha=$3 WHERE id=$4 RETURNING *',
      [concepto?.trim(), parseFloat(monto), fecha, id]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'No encontrado' });
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error('[cashflow/gastos PUT]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/gastos/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM gastos_manuales WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[cashflow/gastos DELETE]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
