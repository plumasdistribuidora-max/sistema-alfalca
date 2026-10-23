// Senzen: lo de Pepa (su semana, comercios, cargar contactos) y el tablero de los dueños.
// El router lo pueden usar la vendedora y los dueños (index.js); lo que es solo de los
// dueños se cierra acá con requireAdmin.

const express = require('express');
const multer  = require('multer');
const pool    = require('../config/db');
const { uploadToR2, getFromR2 } = require('../config/r2');
const { requireAdmin } = require('../middleware/auth');
const senzen  = require('../services/senzen');
const senzenAvisos = require('../services/senzenAvisos');
const { sincronizar } = require('../services/senzenDux');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const TIPOS     = ['supermercado', 'minimercado', 'almacen', 'casa_limpieza', 'bazar', 'ferreteria', 'otro'];
const MEDIOS    = ['visita', 'llamada', 'whatsapp'];
// Cómo terminó, según la tarea (23/10/2026). "no_compro" queda por los contactos viejos.
const RESULTADOS = ['sin_respuesta', 'pedido', 'va_a_comprar', 'volver', 'no_quiere', 'no_compro'];
const RESULTADOS_NUEVO = ['le_intereso', 'pedido', 'volver', 'no_le_interesa'];
const PIDEN_FECHA = ['va_a_comprar', 'volver'];
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

const coord = v => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
async function subirFoto(file, carpeta) {
  if (!file) return { foto_key: null, foto_mime: null };
  const ext = (file.mimetype.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '');
  const foto_key = `senzen/contactos/${carpeta}/${Date.now()}.${ext}`;
  await uploadToR2(foto_key, file.buffer, file.mimetype);
  return { foto_key, foto_mime: file.mimetype };
}
// El comentario de cómo le fue es obligatorio en todo reporte: es lo que lee el dueño para aprobarlo.
const comentarioDe = b => (typeof b.comentario === 'string' ? b.comentario.trim().slice(0, 1000) : '');

// Contactar a un cliente: el reporte de esa tarea. En las visitas la foto de la exhibición
// es obligatoria. Queda esperando la aprobación de un dueño.
router.post('/contactos', upload.single('foto'), async (req, res) => {
  const b = req.body || {};
  const comercio_id = parseInt(b.comercio_id);
  if (!comercio_id) return res.status(400).json({ ok: false, error: 'Elegí el comercio' });
  if (!MEDIOS.includes(b.medio)) return res.status(400).json({ ok: false, error: 'Elegí si fue visita, llamada o WhatsApp' });
  if (!RESULTADOS.includes(b.resultado)) return res.status(400).json({ ok: false, error: 'Elegí qué pasó' });
  if (b.resultado === 'no_compro' && !MOTIVOS.includes(b.motivo)) return res.status(400).json({ ok: false, error: 'Elegí por qué no compró' });
  if (PIDEN_FECHA.includes(b.resultado) && !ISO.test(b.volver_el || '')) return res.status(400).json({ ok: false, error: 'Elegí para cuándo' });
  if (b.volver_el && !ISO.test(b.volver_el)) return res.status(400).json({ ok: false, error: 'La fecha no se entiende' });
  if (comentarioDe(b).length < 5) return res.status(400).json({ ok: false, error: 'Contá cómo fue' });
  if (b.medio === 'visita' && !req.file) return res.status(400).json({ ok: false, error: 'En una visita falta la foto de cómo quedó el producto' });
  try {
    const { rows } = await pool.query('SELECT id FROM senzen_comercios WHERE id = $1', [comercio_id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Comercio no encontrado' });
    const foto = await subirFoto(req.file, comercio_id);
    const r = await senzen.registrarContacto({
      comercio_id, tipo: 'seguimiento', medio: b.medio, resultado: b.resultado, comentario: comentarioDe(b),
      motivo: b.resultado === 'no_compro' ? b.motivo : (MOTIVOS.includes(b.motivo) ? b.motivo : null),
      volver_el: b.volver_el || null, lat: coord(b.lat), lng: coord(b.lng), ...foto,
    }, req.user.id);
    senzenAvisos.paraAprobar(req.user);
    res.status(201).json({ ok: true, data: r });
  } catch (err) { fallo(res, 'contactos', 'No se pudo guardar el contacto')(err); }
});

// Visitar un comercio nuevo: se carga el comercio y la visita juntos. La foto de la puerta
// del local es obligatoria (Martín, 23/10/2026).
router.post('/visitas-nuevas', upload.single('foto'), async (req, res) => {
  const b = req.body || {};
  const nombre = limpio(b.nombre);
  if (!req.file) return res.status(400).json({ ok: false, error: 'Falta la foto de la puerta del local' });
  if (!nombre) return res.status(400).json({ ok: false, error: 'Escribí el nombre del comercio' });
  if (b.tipo && !TIPOS.includes(b.tipo)) return res.status(400).json({ ok: false, error: 'Elegí un tipo de comercio de la lista' });
  if (!RESULTADOS_NUEVO.includes(b.resultado)) return res.status(400).json({ ok: false, error: 'Elegí cómo te fue' });
  if (b.resultado === 'volver' && !ISO.test(b.volver_el || '')) return res.status(400).json({ ok: false, error: 'Elegí cuándo volver a pasar' });
  if (comentarioDe(b).length < 5) return res.status(400).json({ ok: false, error: 'Contá cómo te fue' });
  try {
    const dup = await pool.query('SELECT id FROM senzen_comercios WHERE lower(trim(nombre)) = lower($1)', [nombre]);
    if (dup.rows.length) return res.status(409).json({ ok: false, error: 'Ese comercio ya está cargado: buscalo en Comercios' });
    const foto = await subirFoto(req.file, 'nuevos');
    const r = await senzen.registrarContacto({
      comercio: { nombre, tipo: b.tipo || null, localidad: limpio(b.localidad), direccion: limpio(b.direccion), contacto: limpio(b.contacto), telefono: limpio(b.telefono) },
      tipo: 'nuevo', medio: 'visita', resultado: b.resultado, comentario: comentarioDe(b),
      volver_el: b.resultado === 'volver' ? b.volver_el : null, lat: coord(b.lat), lng: coord(b.lng), ...foto,
    }, req.user.id);
    senzenAvisos.paraAprobar(req.user);
    res.status(201).json({ ok: true, data: r });
  } catch (err) { fallo(res, 'visitas-nuevas', 'No se pudo guardar la visita')(err); }
});

// Corregir un reporte que un dueño devolvió: vuelve a esperar la aprobación.
router.put('/contactos/:id', upload.single('foto'), async (req, res) => {
  const b = req.body || {};
  try {
    const k = await senzen.contacto(req.params.id);
    if (!k) return res.status(404).json({ ok: false, error: 'No existe ese reporte' });
    if (k.usuario_id !== req.user.id) return res.status(403).json({ ok: false, error: 'Lo corrige quien lo cargó' });
    if (k.aprobacion !== 'devuelto') return res.status(409).json({ ok: false, error: 'Solo se corrige un reporte que te devolvieron' });
    const validos = k.tipo === 'nuevo' ? RESULTADOS_NUEVO : RESULTADOS;
    const resultado = validos.includes(b.resultado) ? b.resultado : k.resultado;
    if (PIDEN_FECHA.includes(resultado) && !ISO.test(b.volver_el || k.volver_el || '')) return res.status(400).json({ ok: false, error: 'Elegí para cuándo' });
    if (comentarioDe(b).length < 5) return res.status(400).json({ ok: false, error: 'Contá cómo fue' });
    const foto = await subirFoto(req.file, k.comercio_id);
    await pool.query(`
      UPDATE senzen_contactos SET resultado = $2, comentario = $3, volver_el = COALESCE($4, volver_el),
             foto_key = COALESCE($5, foto_key), foto_mime = COALESCE($6, foto_mime), aprobacion = 'pendiente'
      WHERE id = $1`, [k.id, resultado, comentarioDe(b), ISO.test(b.volver_el || '') ? b.volver_el : null, foto.foto_key, foto.foto_mime]);
    senzenAvisos.paraAprobar(req.user);
    res.json({ ok: true });
  } catch (err) { fallo(res, 'contactos PUT', 'No se pudo guardar')(err); }
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

// La semana de Pepa para los dueños: qué aprobar, el plan y cómo va.
router.get('/semana', requireAdmin, (req, res) => {
  senzen.semanaDuenos().then(data => res.json({ ok: true, data })).catch(fallo(res, 'semana', 'No se pudo cargar la semana de Pepa'));
});

// Aprobar un reporte o devolvérselo pidiéndole algo más.  { accion: aprobar|devolver, texto }
router.post('/contactos/:id/aprobar', requireAdmin, async (req, res) => {
  const { accion } = req.body || {};
  const texto = typeof req.body?.texto === 'string' ? req.body.texto.trim().slice(0, 500) : '';
  if (!['aprobar', 'devolver'].includes(accion)) return res.status(400).json({ ok: false, error: 'Acción inválida' });
  if (accion === 'devolver' && texto.length < 3) return res.status(400).json({ ok: false, error: 'Escribí qué le pedís' });
  try {
    const k = await senzen.contacto(req.params.id);
    if (!k) return res.status(404).json({ ok: false, error: 'No existe ese reporte' });
    if (k.aprobacion !== 'pendiente') return res.status(409).json({ ok: false, error: k.aprobacion === 'aprobado' ? 'Ya lo aprobó otro dueño' : 'Está devuelto: espera que Pepa lo corrija' });
    await pool.query(`UPDATE senzen_contactos SET aprobacion = $2, aprobado_por = $3, aprobado_en = NOW(), respuesta = COALESCE($4, respuesta) WHERE id = $1`,
      [k.id, accion === 'aprobar' ? 'aprobado' : 'devuelto', req.user.id, texto || null]);
    senzenAvisos.respuesta(k, req.user, accion, texto);
    res.json({ ok: true });
  } catch (err) { fallo(res, 'aprobar', 'No se pudo guardar')(err); }
});

// Cuántos comercios nuevos tiene que visitar una semana.  { meta_nuevos }
router.put('/semanas/:desde', requireAdmin, async (req, res) => {
  const desde = req.params.desde;
  const n = Math.round(Number(req.body?.meta_nuevos));
  if (!ISO.test(desde) || senzen.lunes(desde) !== desde) return res.status(400).json({ ok: false, error: 'La semana arranca un lunes' });
  if (!Number.isFinite(n) || n < 0 || n > 100) return res.status(400).json({ ok: false, error: 'Poné cuántos comercios' });
  try {
    await pool.query(`INSERT INTO senzen_semanas (desde, meta_nuevos, cambiada_por) VALUES ($1,$2,$3)
                      ON CONFLICT (desde) DO UPDATE SET meta_nuevos = $2, cambiada_por = $3, cambiada_en = NOW()`, [desde, n, req.user.id]);
    res.json({ ok: true });
  } catch (err) { fallo(res, 'semanas', 'No se pudo guardar')(err); }
});

// Encargarle a Pepa que contacte a un cliente.  { comercio_id, vence, nota? }
router.post('/tareas', requireAdmin, async (req, res) => {
  const { comercio_id, vence } = req.body || {};
  const nota = limpio(req.body?.nota);
  if (!parseInt(comercio_id)) return res.status(400).json({ ok: false, error: 'Elegí el comercio' });
  if (!ISO.test(vence || '')) return res.status(400).json({ ok: false, error: 'Elegí para cuándo' });
  try {
    await senzen.encargar(parseInt(comercio_id), vence, req.user.id, nota);
    const { rows: [c] } = await pool.query('SELECT nombre FROM senzen_comercios WHERE id = $1', [parseInt(comercio_id)]);
    senzenAvisos.encargo(c?.nombre || 'un cliente', vence, nota, req.user);
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
