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
  const charla = typeof req.body?.charla === 'string' && /^[\w-]{1,64}$/.test(req.body.charla) ? req.body.charla : null;
  try {
    const r = await asistente.preguntar({ usuario: req.user, pregunta, historial, charla });
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

router.get('/charlas', (req, res) => {
  asistente.charlas(req.user.id).then(data => res.json({ ok: true, data }))
    .catch(err => { console.error('[asistente/charlas]', err); res.status(500).json({ ok: false, error: 'No se pudieron leer las charlas' }); });
});

router.get('/charlas/:id', (req, res) => {
  asistente.charla(req.user.id, req.params.id).then(data => {
    if (!data.length) return res.status(404).json({ ok: false, error: 'No está esa charla' });
    res.json({ ok: true, data });
  }).catch(err => { console.error('[asistente/charla]', err); res.status(500).json({ ok: false, error: 'No se pudo abrir la charla' }); });
});

module.exports = router;
