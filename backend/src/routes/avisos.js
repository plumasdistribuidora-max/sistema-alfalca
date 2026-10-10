// Avisos en el celular: dar de alta y de baja el aparato, y mandarse uno de prueba.

const express = require('express');
const pool    = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const avisos  = require('../services/avisos');

const router = express.Router();

// La clave pública con la que el celular se suscribe.
router.get('/clave', requireAuth, async (_req, res) => {
  try {
    res.json({ ok: true, data: { clave: (await avisos.clavesVapid()).publica } });
  } catch (err) {
    console.error('[avisos/clave]', err);
    res.status(500).json({ ok: false, error: 'No se pudo preparar los avisos' });
  }
});

router.post('/suscribir', requireAuth, async (req, res) => {
  try {
    const { endpoint, keys } = req.body?.suscripcion || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ ok: false, error: 'Suscripción inválida' });
    }
    // Si el aparato estaba a nombre de otra persona (se prestó el celular), pasa a esta.
    await pool.query(`
      INSERT INTO avisos_suscripciones (usuario_id, endpoint, p256dh, auth, aparato)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (endpoint) DO UPDATE SET usuario_id = EXCLUDED.usuario_id, p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth, aparato = EXCLUDED.aparato
    `, [req.user.id, endpoint, keys.p256dh, keys.auth, String(req.headers['user-agent'] || '').slice(0, 200)]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[avisos/suscribir]', err);
    res.status(500).json({ ok: false, error: 'No se pudieron activar los avisos' });
  }
});

// Al cerrar sesión: ese aparato deja de recibir avisos.
router.post('/desuscribir', requireAuth, async (req, res) => {
  try {
    if (req.body?.endpoint) {
      await pool.query('DELETE FROM avisos_suscripciones WHERE endpoint = $1 AND usuario_id = $2', [req.body.endpoint, req.user.id]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[avisos/desuscribir]', err);
    res.status(500).json({ ok: false, error: 'No se pudieron desactivar los avisos' });
  }
});

router.get('/estado', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM avisos_suscripciones WHERE usuario_id = $1', [req.user.id]);
  res.json({ ok: true, data: { aparatos: rows[0].n } });
});

router.post('/prueba', requireAuth, async (req, res) => {
  try {
    const enviados = await avisos.enviarAUsuarios([req.user.id], {
      titulo: 'Avisos activados',
      texto: 'Así te van a llegar los reportes del día y lo que haya para aprobar.',
      url: '/', etiqueta: 'prueba',
    });
    if (!enviados) return res.status(400).json({ ok: false, error: 'Este usuario no tiene ningún aparato con avisos activados' });
    res.json({ ok: true, data: { enviados } });
  } catch (err) {
    console.error('[avisos/prueba]', err);
    res.status(500).json({ ok: false, error: 'No se pudo mandar el aviso' });
  }
});

module.exports = router;
