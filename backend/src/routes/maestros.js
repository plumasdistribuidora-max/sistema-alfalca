'use strict';

const express             = require('express');
const multer              = require('multer');
const { HeadObjectCommand } = require('@aws-sdk/client-s3');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { loadMaestro, getMaestroArray, isLoaded } = require('../services/maestroDocenas');
const { uploadToR2, getFromR2, r2 } = require('../config/r2');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
});

const R2_KEY = 'maestros/alfalca/Maestro_Productos_Docenas_ALFALCA.xlsx';
const BUCKET = process.env.R2_BUCKET;

async function getR2LastModified() {
  try {
    const head = await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: R2_KEY }));
    return head.LastModified?.toISOString() ?? null;
  } catch {
    return null;
  }
}

// GET /docenas/estado
router.get('/docenas/estado', requireAuth, requireAdmin, async (req, res) => {
  try {
    const arr       = getMaestroArray();
    const variantes = arr.reduce((s, p) => s + (p.variantes?.length || 1), 0);
    const ultima_actualizacion = await getR2LastModified();
    res.json({
      ok: true,
      loaded: isLoaded(),
      productos: arr.length,
      variantes,
      ultima_actualizacion,
    });
  } catch (err) {
    console.error('[maestros/docenas/estado]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /docenas/upload
router.post(
  '/docenas/upload',
  requireAuth,
  requireAdmin,
  (req, res, next) => {
    upload.single('archivo')(req, res, (err) => {
      if (err?.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ ok: false, error: 'Archivo demasiado grande (máximo 10 MB)' });
      }
      if (err) return next(err);
      next();
    });
  },
  async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ ok: false, error: 'No se recibió ningún archivo' });
      }
      if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
        return res.status(400).json({ ok: false, error: 'Formato no válido. Solo se aceptan archivos .xlsx' });
      }

      await uploadToR2(
        R2_KEY,
        file.buffer,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );

      const result             = await loadMaestro();
      const ultima_actualizacion = await getR2LastModified();

      res.json({ ok: true, ...result, ultima_actualizacion });
    } catch (err) {
      console.error('[maestros/docenas/upload]', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  },
);

// GET /docenas/download
router.get('/docenas/download', requireAuth, requireAdmin, async (req, res) => {
  try {
    const r2Res = await getFromR2(R2_KEY);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Maestro_Productos_Docenas_ALFALCA.xlsx"');
    if (r2Res.ContentLength) res.setHeader('Content-Length', r2Res.ContentLength);
    r2Res.Body.pipe(res);
  } catch (err) {
    console.error('[maestros/docenas/download]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /docenas/reload
router.post('/docenas/reload', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await loadMaestro();
    res.json({ ok: true, mensaje: 'Maestro recargado correctamente', ...result });
  } catch (err) {
    console.error('[maestros/docenas/reload]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /docenas — listado completo (debug)
router.get('/docenas', requireAuth, async (req, res) => {
  res.json({
    ok:     true,
    loaded: isLoaded(),
    total:  getMaestroArray().length,
    data:   getMaestroArray(),
  });
});

module.exports = router;
