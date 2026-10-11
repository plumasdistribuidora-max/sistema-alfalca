// Kankay: dashboard, import del Excel de Dux, historial, estado de resultados y avisos.
// Todo es solo del dueño: el router se cierra en index.js.

const express = require('express');
const multer  = require('multer');
const pool    = require('../config/db');
const { uploadToR2 } = require('../config/r2');
const kankay  = require('../services/kankay');
const kAvisos = require('../services/kankayAvisos');
const { enSegundoPlano } = require('../services/avisos');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;

// "Martín (Admin)" → "Martín": así se lee en el aviso.
const nombreDe = async id => (await pool.query('SELECT nombre FROM usuarios WHERE id = $1', [id])).rows[0]?.nombre?.replace(/\s*\(.*\)\s*$/, '');

router.get('/datos', async (_req, res) => {
  try {
    const [d, e] = await Promise.all([kankay.datos(), kankay.eerrManual()]);
    res.json({ ok: true, data: { ...d, eerr: e } });
  } catch (err) {
    console.error('[kankay/datos]', err);
    res.status(500).json({ ok: false, error: 'No se pudieron cargar los datos de Kankay' });
  }
});

router.post('/import', upload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'Falta el archivo' });
  const archivo = req.file.originalname;
  if (!/\.xlsx?$/i.test(archivo)) return res.status(400).json({ ok: false, error: 'Tiene que ser un Excel (.xls o .xlsx)' });
  let imp;
  try {
    imp = await kankay.importar(req.file.buffer, archivo, req.user.id);
  } catch (err) {
    console.error('[kankay/import]', err);
    return res.status(400).json({ ok: false, error: err.message || 'No se pudo leer el Excel' });
  }
  // El archivo original queda guardado; si R2 falla, el import ya está hecho igual.
  const hoy = new Date().toISOString().slice(0, 10);
  uploadToR2(`imports/kankay/${hoy}-${archivo.replace(/[^a-zA-Z0-9._-]/g, '_')}`, req.file.buffer, req.file.mimetype || 'application/vnd.ms-excel')
    .catch(err => console.warn('[kankay/import] R2:', err.message));
  enSegundoPlano(kAvisos.trasImport(imp, req.user.id), 'kankay ventas');
  res.json({ ok: true, data: imp });
});

router.get('/imports', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT i.id, i.archivo, to_char(i.desde,'YYYY-MM-DD') AS desde, to_char(i.hasta,'YYYY-MM-DD') AS hasta,
             i.renglones, i.ventas, i.total::float, i.neto::float, i.subido_en, u.nombre AS subido_por,
             (SELECT COUNT(*)::int FROM kankay_ventas v WHERE v.import_id = i.id) AS vigentes
      FROM kankay_imports i LEFT JOIN usuarios u ON u.id = i.subido_por
      ORDER BY i.subido_en DESC
    `);
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error('[kankay/imports]', err);
    res.status(500).json({ ok: false, error: 'No se pudo cargar el historial' });
  }
});

router.put('/eerr/:periodo', async (req, res) => {
  const { periodo } = req.params;
  if (!PERIODO.test(periodo)) return res.status(400).json({ ok: false, error: 'Período inválido' });
  try {
    // Cada cambio se guarda sin avisar: el aviso sale cuando alguien da el mes por terminado.
    await kankay.guardarEerr(periodo, req.body || {}, req.user.id);
    res.json({ ok: true, data: (await kankay.eerrManual()) });
  } catch (err) {
    console.error('[kankay/eerr]', err);
    res.status(500).json({ ok: false, error: 'No se pudo guardar' });
  }
});

router.post('/eerr/:periodo/terminar', async (req, res) => {
  const { periodo } = req.params;
  if (!PERIODO.test(periodo)) return res.status(400).json({ ok: false, error: 'Período inválido' });
  try {
    if (!await kankay.terminarEerr(periodo, req.user.id)) {
      return res.status(400).json({ ok: false, error: 'Ese mes todavía no tiene nada cargado' });
    }
    const enviados = await kAvisos.eerrTerminado(periodo, await nombreDe(req.user.id)).catch(err => {
      console.warn('[kankay/terminar] aviso:', err.message); return 0;
    });
    res.json({ ok: true, data: { eerr: await kankay.eerrManual(), enviados } });
  } catch (err) {
    console.error('[kankay/terminar]', err);
    res.status(500).json({ ok: false, error: 'No se pudo marcar como terminado' });
  }
});

router.put('/comision', async (req, res) => {
  const v = Number(String(req.body?.pct ?? '').replace(',', '.'));
  if (!isFinite(v) || v < 0 || v > 50) return res.status(400).json({ ok: false, error: 'Poné un porcentaje entre 0 y 50' });
  try {
    await pool.query(`
      INSERT INTO parametros (clave, valor, updated_at) VALUES ('kankay_comision_pct', $1, NOW())
      ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = NOW()
    `, [String(v)]);
    res.json({ ok: true, data: { pct: v } });
  } catch (err) {
    console.error('[kankay/comision]', err);
    res.status(500).json({ ok: false, error: 'No se pudo guardar' });
  }
});

router.get('/avisos', async (req, res) => {
  try {
    res.json({ ok: true, data: await kAvisos.preferencias(req.user.id) });
  } catch (err) {
    console.error('[kankay/avisos]', err);
    res.status(500).json({ ok: false, error: 'No se pudieron cargar los avisos' });
  }
});

router.put('/avisos/:tema', async (req, res) => {
  try {
    await kAvisos.guardarPreferencia(req.user.id, req.params.tema, req.body?.activo);
    res.json({ ok: true, data: await kAvisos.preferencias(req.user.id) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

module.exports = router;
