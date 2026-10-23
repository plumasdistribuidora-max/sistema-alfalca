// El asistente de los dueños: preguntas sobre el negocio que Claude responde con la base.
// Solo el dueño (index.js).

const express   = require('express');
const asistente = require('../services/asistente');

const router = express.Router();

router.post('/preguntar', async (req, res) => {
  const pregunta = typeof req.body?.pregunta === 'string' ? req.body.pregunta.trim() : '';
  if (!pregunta) return res.status(400).json({ ok: false, error: 'Escribí una pregunta' });
  if (pregunta.length > 2000) return res.status(400).json({ ok: false, error: 'La pregunta es muy larga' });
  const historial = Array.isArray(req.body?.historial) ? req.body.historial : [];
  try {
    const r = await asistente.preguntar({ usuario: req.user, pregunta, historial });
    if (r.error) return res.status(502).json({ ok: false, error: r.error, data: r });
    res.json({ ok: true, data: r });
  } catch (err) {
    console.error('[asistente/preguntar]', err);
    res.status(err.status || 500).json({ ok: false, error: err.status ? err.message : 'No se pudo responder la pregunta' });
  }
});

router.get('/gasto', (req, res) => {
  asistente.gasto().then(data => res.json({ ok: true, data }))
    .catch(err => { console.error('[asistente/gasto]', err); res.status(500).json({ ok: false, error: 'No se pudo leer el gasto' }); });
});

module.exports = router;
