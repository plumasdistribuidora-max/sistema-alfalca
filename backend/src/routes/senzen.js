// Senzen: lo de Pepa (su semana, comercios, cargar contactos) y el tablero de los dueños.
// El router lo pueden usar la vendedora y los dueños (index.js); lo que es solo de los
// dueños se cierra acá con requireAdmin.

const express = require('express');
const multer  = require('multer');
const pool    = require('../config/db');
const { uploadToR2, getFromR2 } = require('../config/r2');
const { requireAdmin } = require('../middleware/auth');
const senzen  = require('../services/senzen');
const { sincronizar } = require('../services/senzenDux');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const TIPOS     = ['supermercado', 'minimercado', 'almacen', 'casa_limpieza', 'bazar', 'ferreteria', 'otro'];
const MEDIOS    = ['visita', 'llamada', 'whatsapp'];
const RESULTADOS = ['pedido', 'va_a_comprar', 'volver', 'no_compro'];
const MOTIVOS   = ['tiene_stock', 'precio', 'no_estaba', 'otra_marca', 'no_le_interesa'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const fallo = (res, ctx, msg) => err => {
  console.error(`[senzen/${ctx}]`, err);
  res.status(500).json({ ok: false, error: msg });
};
const limpio = v => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null);

router.get('/mi-semana', (req, res) => {
  senzen.miSemana().then(data => res.json({ ok: true, data })).catch(fallo(res, 'mi-semana', 'No se pudo cargar tu semana'));
});

router.get('/comercios', (req, res) => {
  senzen.comercios().then(data => res.json({ ok: true, data })).catch(fallo(res, 'comercios', 'No se pudieron cargar los comercios'));
});

router.post('/comercios', async (req, res) => {
  const b = req.body || {};
  const nombre = limpio(b.nombre);
  if (!nombre) return res.status(400).json({ ok: false, error: 'Falta el nombre del comercio' });
  if (b.tipo && !TIPOS.includes(b.tipo)) return res.status(400).json({ ok: false, error: 'Elegí un tipo de comercio de la lista' });
  try {
    const dup = await pool.query('SELECT id FROM senzen_comercios WHERE lower(trim(nombre)) = lower($1)', [nombre]);
    if (dup.rows.length) return res.status(409).json({ ok: false, error: 'Ya hay un comercio con ese nombre' });
    const { rows: [c] } = await pool.query(`
      INSERT INTO senzen_comercios (nombre, tipo, localidad, direccion, contacto, telefono, creado_por)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [nombre, b.tipo || null, limpio(b.localidad), limpio(b.direccion), limpio(b.contacto), limpio(b.telefono), req.user.id]);
    res.status(201).json({ ok: true, data: c });
  } catch (err) { fallo(res, 'comercios POST', 'No se pudo guardar el comercio')(err); }
});

// Pepa corrige los datos; consignación y dar de baja son de los dueños.
router.put('/comercios/:id', async (req, res) => {
  const b = req.body || {};
  if (b.tipo && !TIPOS.includes(b.tipo)) return res.status(400).json({ ok: false, error: 'Elegí un tipo de comercio de la lista' });
  const dueno = req.user.rol === 'admin';
  try {
    const { rowCount } = await pool.query(`
      UPDATE senzen_comercios SET
        nombre = COALESCE($2, nombre), tipo = $3, localidad = $4, direccion = $5, contacto = $6, telefono = $7,
        consignacion = CASE WHEN $8 THEN COALESCE($9, consignacion) ELSE consignacion END,
        activo       = CASE WHEN $8 THEN COALESCE($10, activo) ELSE activo END
      WHERE id = $1`,
      [req.params.id, limpio(b.nombre), b.tipo || null, limpio(b.localidad), limpio(b.direccion), limpio(b.contacto), limpio(b.telefono),
       dueno, typeof b.consignacion === 'boolean' ? b.consignacion : null, typeof b.activo === 'boolean' ? b.activo : null]);
    if (!rowCount) return res.status(404).json({ ok: false, error: 'Comercio no encontrado' });
    res.json({ ok: true });
  } catch (err) { fallo(res, 'comercios PUT', 'No se pudo guardar el comercio')(err); }
});

// Un contacto de Pepa. En las visitas la foto de la exhibición es obligatoria.
router.post('/contactos', upload.single('foto'), async (req, res) => {
  const b = req.body || {};
  const comercio_id = parseInt(b.comercio_id);
  if (!comercio_id) return res.status(400).json({ ok: false, error: 'Elegí el comercio' });
  if (!MEDIOS.includes(b.medio)) return res.status(400).json({ ok: false, error: 'Elegí si fue visita, llamada o WhatsApp' });
  if (!RESULTADOS.includes(b.resultado)) return res.status(400).json({ ok: false, error: 'Elegí cómo terminó' });
  if (b.resultado === 'no_compro' && !MOTIVOS.includes(b.motivo)) return res.status(400).json({ ok: false, error: 'Elegí por qué no compró' });
  if (['va_a_comprar', 'volver'].includes(b.resultado) && !ISO.test(b.volver_el || '')) return res.status(400).json({ ok: false, error: 'Elegí cuándo volver a hablarle' });
  if (b.volver_el && !ISO.test(b.volver_el)) return res.status(400).json({ ok: false, error: 'La fecha para volver no se entiende' });
  if (b.medio === 'visita' && !req.file) return res.status(400).json({ ok: false, error: 'En una visita falta la foto de cómo quedó el producto' });
  try {
    const { rows } = await pool.query('SELECT id FROM senzen_comercios WHERE id = $1', [comercio_id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Comercio no encontrado' });
    let foto_key = null;
    if (req.file) {
      const ext = (req.file.mimetype.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '');
      foto_key = `senzen/contactos/${comercio_id}/${Date.now()}.${ext}`;
      await uploadToR2(foto_key, req.file.buffer, req.file.mimetype);
    }
    const coord = v => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const id = await senzen.registrarContacto({
      comercio_id, medio: b.medio, resultado: b.resultado,
      motivo: b.resultado === 'no_compro' ? b.motivo : null,
      volver_el: b.volver_el || null, lat: coord(b.lat), lng: coord(b.lng),
      foto_key, foto_mime: req.file?.mimetype || null,
    }, req.user.id);
    res.status(201).json({ ok: true, data: { id } });
  } catch (err) { fallo(res, 'contactos', 'No se pudo guardar el contacto')(err); }
});

router.get('/contactos/:id/foto', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT usuario_id, foto_key, foto_mime FROM senzen_contactos WHERE id = $1', [req.params.id]);
    const k = rows[0];
    if (!k?.foto_key) return res.status(404).json({ ok: false, error: 'Foto no encontrada' });
    if (req.user.rol !== 'admin' && k.usuario_id !== req.user.id) return res.status(403).json({ ok: false, error: 'Sin acceso' });
    const obj = await getFromR2(k.foto_key);
    res.setHeader('Content-Type', k.foto_mime || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    obj.Body.pipe(res);
  } catch (err) { fallo(res, 'foto', 'No se pudo traer la foto')(err); }
});

// ── Solo dueños ──────────────────────────────────────────────────────────────

router.get('/datos', requireAdmin, (req, res) => {
  senzen.datos().then(data => res.json({ ok: true, data })).catch(fallo(res, 'datos', 'No se pudieron cargar los datos de Senzen'));
});

// Para la tarjeta de Senzen en el inicio.
router.get('/resumen', requireAdmin, async (req, res) => {
  try {
    const hoy = require('../utils/fechas').hoyStr(), mes = hoy.slice(0, 7);
    const ant = senzen.sumarDias(mes + '-01', -1).slice(0, 7);
    const { rows: [r] } = await pool.query(`
      SELECT COALESCE(SUM(total) FILTER (WHERE to_char(fecha,'YYYY-MM') = $1),0)::float AS mes,
             COUNT(DISTINCT id_cliente) FILTER (WHERE to_char(fecha,'YYYY-MM') = $1)::int AS clientes,
             COALESCE(SUM(total) FILTER (WHERE to_char(fecha,'YYYY-MM') = $2),0)::float AS mes_ant
      FROM senzen_facturas WHERE NOT anulada`, [mes, ant]);
    const s = await senzen.semana(senzen.lunes(hoy));
    const tareas = (await senzen.tareasAbiertas()).filter(t => t.vence <= hoy).length;
    const { rows: [sync] } = await pool.query(`SELECT termino FROM senzen_sync WHERE ok ORDER BY id DESC LIMIT 1`);
    res.json({ ok: true, data: { ...r, contactos: s.contactos, tareas, sync: sync?.termino || null } });
  } catch (err) { fallo(res, 'resumen', 'No se pudo armar el resumen de Senzen')(err); }
});

router.post('/tareas', requireAdmin, async (req, res) => {
  const { comercio_id, vence } = req.body || {};
  if (!parseInt(comercio_id)) return res.status(400).json({ ok: false, error: 'Elegí el comercio' });
  if (!ISO.test(vence || '')) return res.status(400).json({ ok: false, error: 'Elegí para cuándo' });
  try {
    await senzen.encargar(parseInt(comercio_id), vence, req.user.id);
    res.json({ ok: true });
  } catch (err) { fallo(res, 'tareas', 'No se pudo encargar')(err); }
});

router.post('/tareas/:id/descartar', requireAdmin, async (req, res) => {
  try {
    await pool.query(`UPDATE senzen_tareas SET estado = 'descartada', cerrada_en = NOW() WHERE id = $1 AND estado = 'pendiente'`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { fallo(res, 'descartar', 'No se pudo descartar')(err); }
});

router.put('/metas', requireAdmin, async (req, res) => {
  try {
    for (const k of ['contactos', 'nuevos', 'ventas']) {
      if (!(k in (req.body || {}))) continue;
      const v = req.body[k];
      const val = v === null || v === '' ? '' : String(Math.max(0, Math.round(Number(v))));
      if (val !== '' && !Number.isFinite(Number(val))) return res.status(400).json({ ok: false, error: 'Las metas son números' });
      await pool.query(`INSERT INTO parametros (clave, valor) VALUES ($1,$2)
                        ON CONFLICT (clave) DO UPDATE SET valor = $2, updated_at = NOW()`, [`senzen_meta_${k}`, val]);
    }
    res.json({ ok: true, data: await senzen.metas() });
  } catch (err) { fallo(res, 'metas', 'No se pudieron guardar las metas')(err); }
});

// "Actualizar ahora": trae Dux en el momento, sin esperar la vuelta automática.
router.post('/sincronizar', requireAdmin, async (req, res) => {
  try {
    const d = await sincronizar();
    await senzen.generarTareas();
    res.json({ ok: true, data: d });
  } catch (err) {
    console.error('[senzen/sincronizar]', err);
    res.status(502).json({ ok: false, error: err.message || 'No se pudo leer Dux' });
  }
});

module.exports = router;
