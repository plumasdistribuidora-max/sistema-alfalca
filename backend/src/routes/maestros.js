const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { loadMaestro, getMaestroArray, isLoaded } = require('../services/maestroDocenas');

const router = express.Router();

// Recarga el maestro desde R2 sin redeploy
router.post('/docenas/reload', requireAuth, async (req, res) => {
  try {
    const result = await loadMaestro();
    res.json({ ok: true, mensaje: 'Maestro recargado correctamente', ...result });
  } catch (err) {
    console.error('[maestros/docenas/reload]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Devuelve el maestro completo (útil para debug y visualización en frontend)
router.get('/docenas', requireAuth, async (req, res) => {
  res.json({
    ok:     true,
    loaded: isLoaded(),
    total:  getMaestroArray().length,
    data:   getMaestroArray(),
  });
});

module.exports = router;
