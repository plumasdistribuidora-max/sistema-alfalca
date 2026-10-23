// El asistente de los dueños: preguntas sobre el negocio que Claude responde con la base.
// Solo el dueño (index.js).

const express   = require('express');
const asistente = require('../services/asistente');
const archivos  = require('../services/asistenteArchivos');

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

// El Excel y el PDF de una respuesta. Solo los de las preguntas propias.
router.get('/preguntas/:id/:tipo(excel|pdf)', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: 'Pregunta inválida' });
  try {
    const p = await asistente.preguntaConTabla(req.user.id, id);
    if (!p) return res.status(404).json({ ok: false, error: 'Esa respuesta no tiene tabla para bajar' });
    const esExcel = req.params.tipo === 'excel';
    const archivo = esExcel ? archivos.excel(p) : await archivos.pdf(p);
    const nombre = archivos.nombreArchivo(p.tabla.titulo, esExcel ? 'xlsx' : 'pdf');
    res.setHeader('Content-Type', esExcel ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nombre)}`);
    res.send(archivo);
  } catch (err) {
    console.error('[asistente/archivo]', err);
    res.status(500).json({ ok: false, error: 'No se pudo armar el archivo' });
  }
});

module.exports = router;
