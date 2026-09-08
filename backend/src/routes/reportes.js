const express = require('express');
const multer  = require('multer');
const pool    = require('../config/db');
const { uploadToR2, getFromR2 } = require('../config/r2');
const { requireAuth, requireRol, ROLES, ROLES_RED } = require('../middleware/auth');

const router = express.Router();

// Fotos sacadas con el celular. El frontend las comprime antes de subir; el límite acá
// es la red de contención por si alguna pasa sin comprimir.
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) return cb(new Error('Solo se pueden subir imágenes'));
    cb(null, true);
  },
});

const ESTADOS = ['borrador', 'enviado', 'observado', 'aprobado'];
const EDITABLES = ['borrador', 'observado'];

// La plantilla que le toca a cada rol.
const PLANTILLA_POR_ROL = {
  [ROLES.EMPLEADO_TIENDA]:  'tienda',
  [ROLES.ENCARGADO_CAFE]:   'cafe',
  [ROLES.ENCARGADO_COCINA]: 'cocina',
};

function hoyStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

function esDeRed(user) { return ROLES_RED.includes(user.rol); }

// Un reporte lo puede ver quien lo cargó, o cualquiera de la red.
function puedeVer(user, reporte) {
  return esDeRed(user) || reporte.usuario_id === user.id;
}

// Valida las respuestas contra la plantilla. Devuelve la lista de lo que falta,
// en el mismo lenguaje que ve la persona en pantalla.
function validar(campos, respuestas) {
  const faltan = [];

  for (const campo of campos) {
    if (!campo.requerido) continue;
    const v = respuestas[campo.codigo];

    switch (campo.tipo) {
      case 'numero':
      case 'moneda':
      case 'decimal':
        if (v === undefined || v === null || v === '' || isNaN(Number(v))) faltan.push(campo.label);
        break;

      case 'si_no':
        if (typeof v !== 'boolean') faltan.push(campo.label);
        break;

      case 'si_no_lista':
        if (v?.hubo === undefined || v?.hubo === null) { faltan.push(campo.label); break; }
        if (v.hubo && !(Array.isArray(v.items) && v.items.length)) {
          faltan.push(`${campo.label} — dijiste que sí, falta el detalle`);
        }
        break;

      case 'horas_empleados':
        if (!Array.isArray(v) || !v.length) { faltan.push(campo.label); break; }
        if (v.some(f => !f.empleado_id || !(Number(f.horas) > 0))) {
          faltan.push(`${campo.label} — falta completar alguna fila`);
        }
        break;

      case 'foto':
        // Las fotos no viven en respuestas: se cuentan aparte, con los adjuntos.
        break;

      case 'checklist':
        if (!Array.isArray(v) || !v.length) faltan.push(campo.label);
        break;

      default:
        if (v === undefined || v === null || String(v).trim() === '') faltan.push(campo.label);
    }
  }

  return faltan;
}

async function cargarPlantilla(codigo) {
  const { rows } = await pool.query(
    'SELECT * FROM reporte_plantillas WHERE codigo = $1 AND activo = true', [codigo]
  );
  return rows[0] || null;
}

async function adjuntosDe(reporteId) {
  const { rows } = await pool.query(
    'SELECT id, campo_codigo, nombre, mime, tamano FROM reporte_adjuntos WHERE reporte_id = $1 ORDER BY id',
    [reporteId]
  );
  return rows;
}

async function facturasDe(reporteId) {
  const { rows } = await pool.query(`
    SELECT f.id, f.proveedor, f.proveedor_id, f.numero, f.fecha, f.vencimiento, f.total,
           COALESCE(json_agg(json_build_object(
             'producto', i.producto, 'cantidad', i.cantidad, 'precio_unit', i.precio_unit
           ) ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
    FROM facturas f
    LEFT JOIN facturas_items i ON i.factura_id = f.id
    WHERE f.reporte_id = $1
    GROUP BY f.id
    ORDER BY f.id
  `, [reporteId]);
  return rows;
}

// ── GET /plantillas/:codigo ───────────────────────────────────────────────────

router.get('/plantillas/:codigo', requireAuth, async (req, res) => {
  try {
    const plantilla = await cargarPlantilla(req.params.codigo);
    if (!plantilla) return res.status(404).json({ ok: false, error: 'No existe esa plantilla' });
    res.json({ ok: true, data: plantilla });
  } catch (err) {
    console.error('[reportes/plantillas]', err);
    res.status(500).json({ ok: false, error: 'Error al obtener la plantilla' });
  }
});

// ── GET /plantillas ───────────────────────────────────────────────────────────

router.get('/plantillas', requireAuth, requireRol(ROLES.ENCARGADO_GENERAL), async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT codigo, nombre, area, version, campos, activo, updated_at FROM reporte_plantillas ORDER BY nombre'
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error('[reportes/plantillas GET]', err);
    res.status(500).json({ ok: false, error: 'Error al obtener los formularios' });
  }
});

// ── PUT /plantillas/:codigo ───────────────────────────────────────────────────
// Editar un formulario sube su versión. Los reportes ya cargados guardan la versión
// con la que se llenaron, así que no se rompen.

const TIPOS_VALIDOS = [
  'texto', 'texto_largo', 'numero', 'decimal', 'moneda', 'seleccion',
  'si_no', 'si_no_lista', 'horas_empleados', 'checklist', 'foto', 'facturas',
];

router.put('/plantillas/:codigo', requireAuth, requireRol(ROLES.ENCARGADO_GENERAL), async (req, res) => {
  try {
    const { campos, nombre } = req.body;
    if (!Array.isArray(campos) || !campos.length) {
      return res.status(400).json({ ok: false, error: 'El formulario necesita al menos un campo' });
    }

    const codigos = new Set();
    for (const c of campos) {
      if (!c.codigo?.trim())  return res.status(400).json({ ok: false, error: 'Hay un campo sin código interno' });
      if (!c.label?.trim())   return res.status(400).json({ ok: false, error: `El campo "${c.codigo}" no tiene pregunta` });
      if (!TIPOS_VALIDOS.includes(c.tipo)) {
        return res.status(400).json({ ok: false, error: `Tipo desconocido en "${c.label}": ${c.tipo}` });
      }
      if (codigos.has(c.codigo)) {
        return res.status(400).json({ ok: false, error: `El código "${c.codigo}" está repetido` });
      }
      codigos.add(c.codigo);

      if (c.tipo === 'seleccion' && !(c.opciones?.length)) {
        return res.status(400).json({ ok: false, error: `"${c.label}" necesita al menos una opción` });
      }
      if (c.tipo === 'checklist' && !(c.items?.length)) {
        return res.status(400).json({ ok: false, error: `"${c.label}" necesita al menos un ítem` });
      }
      if (c.tipo === 'si_no_lista' && !(c.subcampos?.length)) {
        return res.status(400).json({ ok: false, error: `"${c.label}" necesita al menos un campo de detalle` });
      }
    }

    // El turno estructura el reporte entero: sin él no se sabe de qué turno es.
    if (!codigos.has('turno')) {
      return res.status(400).json({ ok: false, error: 'El formulario no puede quedarse sin el campo de turno' });
    }

    const { rows } = await pool.query(`
      UPDATE reporte_plantillas
      SET campos = $1::jsonb, nombre = COALESCE($2, nombre),
          version = version + 1, updated_at = NOW()
      WHERE codigo = $3
      RETURNING codigo, nombre, area, version, campos
    `, [JSON.stringify(campos), nombre?.trim() || null, req.params.codigo]);

    if (!rows.length) return res.status(404).json({ ok: false, error: 'No existe ese formulario' });
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error('[reportes/plantillas PUT]', err);
    res.status(500).json({ ok: false, error: 'Error al guardar el formulario' });
  }
});

// ── GET /mio ──────────────────────────────────────────────────────────────────
// Lo que necesita la pantalla del empleado al entrar: qué plantilla le toca,
// en qué local, y si ya viene cargando algo hoy.

router.get('/mio', requireAuth, async (req, res) => {
  try {
    const codigo = PLANTILLA_POR_ROL[req.user.rol];
    if (!codigo) {
      return res.status(403).json({ ok: false, error: 'Tu rol no carga reportes de turno' });
    }

    const plantilla = await cargarPlantilla(codigo);
    if (!plantilla) return res.status(404).json({ ok: false, error: 'Todavía no está cargado tu formulario' });

    const localId = req.user.locales_permitidos?.[0];
    if (!localId) {
      return res.status(400).json({ ok: false, error: 'Tu usuario no tiene un local asignado. Avisale al encargado.' });
    }

    const fecha = req.query.fecha || hoyStr();

    const { rows } = await pool.query(`
      SELECT * FROM reportes
      WHERE plantilla_codigo = $1 AND usuario_id = $2 AND fecha = $3
      ORDER BY id DESC
    `, [codigo, req.user.id, fecha]);

    const local = await pool.query('SELECT id, nombre FROM locales WHERE id = $1', [localId]);

    const conExtras = await Promise.all(rows.map(async r => ({
      ...r,
      adjuntos: await adjuntosDe(r.id),
      facturas: codigo === 'cafe' ? await facturasDe(r.id) : [],
    })));

    // Compañeros del local, para el campo de horas del turno.
    const equipo = await pool.query(`
      SELECT id, nombre, puesto FROM empleados
      WHERE local_id_principal = $1 AND activo = true
      ORDER BY nombre
    `, [localId]);

    res.json({
      ok: true,
      data: {
        plantilla,
        local:     local.rows[0] || null,
        fecha,
        reportes:  conExtras,
        equipo:    equipo.rows,
      },
    });
  } catch (err) {
    console.error('[reportes/mio]', err);
    res.status(500).json({ ok: false, error: 'Error al preparar tu reporte' });
  }
});

// ── GET /mis-reportes ─────────────────────────────────────────────────────────

router.get('/mis-reportes', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.id, r.fecha, r.turno, r.estado, r.enviado_at, l.nombre AS local_nombre
      FROM reportes r JOIN locales l ON l.id = r.local_id
      WHERE r.usuario_id = $1
      ORDER BY r.fecha DESC, r.id DESC
      LIMIT 30
    `, [req.user.id]);
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error('[reportes/mis-reportes]', err);
    res.status(500).json({ ok: false, error: 'Error al obtener tus reportes' });
  }
});

// ── POST / ────────────────────────────────────────────────────────────────────
// Crea o actualiza el borrador del día. Idempotente por (plantilla, local, fecha,
// turno, usuario): si vuelve a entrar, sigue editando el mismo.

router.post('/', requireAuth, async (req, res) => {
  try {
    const codigo = PLANTILLA_POR_ROL[req.user.rol];
    if (!codigo) return res.status(403).json({ ok: false, error: 'Tu rol no carga reportes de turno' });

    const plantilla = await cargarPlantilla(codigo);
    if (!plantilla) return res.status(404).json({ ok: false, error: 'Todavía no está cargado tu formulario' });

    const localId = req.user.locales_permitidos?.[0];
    if (!localId) return res.status(400).json({ ok: false, error: 'Tu usuario no tiene un local asignado' });

    const { fecha, turno, respuestas } = req.body;
    if (!turno) return res.status(400).json({ ok: false, error: 'Elegí el turno' });

    const fechaFinal = fecha || hoyStr();

    // El estado se chequea ANTES del upsert: si no, un reporte ya enviado quedaría
    // pisado por el ON CONFLICT antes de llegar al rechazo.
    const previo = await pool.query(`
      SELECT estado FROM reportes
      WHERE plantilla_codigo = $1 AND local_id = $2 AND fecha = $3 AND turno = $4 AND usuario_id = $5
    `, [codigo, localId, fechaFinal, turno, req.user.id]);

    if (previo.rowCount && !EDITABLES.includes(previo.rows[0].estado)) {
      return res.status(409).json({
        ok: false,
        error: previo.rows[0].estado === 'aprobado'
          ? 'Este reporte ya fue aprobado y no se puede modificar'
          : 'Este reporte ya fue enviado. Pedile al encargado que te lo devuelva.',
      });
    }

    const { rows } = await pool.query(`
      INSERT INTO reportes
        (plantilla_codigo, plantilla_version, local_id, empleado_id, usuario_id, fecha, turno, respuestas)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      ON CONFLICT (plantilla_codigo, local_id, fecha, turno, usuario_id) DO UPDATE SET
        respuestas = EXCLUDED.respuestas,
        updated_at = NOW()
      RETURNING *
    `, [
      codigo, plantilla.version, localId, req.user.empleado_id || null, req.user.id,
      fechaFinal, turno, JSON.stringify(respuestas || {}),
    ]);

    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error('[reportes POST]', err);
    res.status(500).json({ ok: false, error: 'Error al guardar el reporte' });
  }
});

// ── POST /:id/adjuntos ────────────────────────────────────────────────────────

router.post('/:id/adjuntos', requireAuth, upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'No llegó ninguna foto' });
    const { campo_codigo } = req.body;
    if (!campo_codigo) return res.status(400).json({ ok: false, error: 'Falta indicar a qué campo corresponde' });

    const { rows } = await pool.query('SELECT * FROM reportes WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Reporte no encontrado' });

    const reporte = rows[0];
    if (reporte.usuario_id !== req.user.id) {
      return res.status(403).json({ ok: false, error: 'Este reporte no es tuyo' });
    }
    if (!EDITABLES.includes(reporte.estado)) {
      return res.status(409).json({ ok: false, error: 'El reporte ya fue enviado' });
    }

    const ext = (req.file.mimetype.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '');
    const key = `reportes/${reporte.local_id}/${reporte.fecha}/${reporte.id}-${campo_codigo}-${Date.now()}.${ext}`;
    await uploadToR2(key, req.file.buffer, req.file.mimetype);

    const ins = await pool.query(`
      INSERT INTO reporte_adjuntos (reporte_id, campo_codigo, r2_key, nombre, mime, tamano)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, campo_codigo, nombre, mime, tamano
    `, [reporte.id, campo_codigo, key, req.file.originalname || null, req.file.mimetype, req.file.size]);

    res.status(201).json({ ok: true, data: ins.rows[0] });
  } catch (err) {
    console.error('[reportes/adjuntos]', err);
    res.status(500).json({ ok: false, error: err.message || 'Error al subir la foto' });
  }
});

// ── GET /adjuntos/:id ─────────────────────────────────────────────────────────

router.get('/adjuntos/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.*, r.usuario_id FROM reporte_adjuntos a
      JOIN reportes r ON r.id = a.reporte_id
      WHERE a.id = $1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Foto no encontrada' });
    if (!puedeVer(req.user, rows[0])) return res.status(403).json({ ok: false, error: 'Sin acceso' });

    const obj = await getFromR2(rows[0].r2_key);
    res.setHeader('Content-Type', rows[0].mime || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    obj.Body.pipe(res);
  } catch (err) {
    console.error('[reportes/adjuntos GET]', err);
    res.status(500).json({ ok: false, error: 'Error al obtener la foto' });
  }
});

// ── DELETE /adjuntos/:id ──────────────────────────────────────────────────────

router.delete('/adjuntos/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.id, r.usuario_id, r.estado FROM reporte_adjuntos a
      JOIN reportes r ON r.id = a.reporte_id
      WHERE a.id = $1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Foto no encontrada' });
    if (rows[0].usuario_id !== req.user.id) return res.status(403).json({ ok: false, error: 'Esta foto no es tuya' });
    if (!EDITABLES.includes(rows[0].estado)) {
      return res.status(409).json({ ok: false, error: 'El reporte ya fue enviado' });
    }

    // El archivo queda en R2 a propósito: borrarlo dejaría el histórico sin la imagen
    // si alguna vez se recupera el reporte.
    await pool.query('DELETE FROM reporte_adjuntos WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[reportes/adjuntos DELETE]', err);
    res.status(500).json({ ok: false, error: 'Error al borrar la foto' });
  }
});

// ── POST /:id/facturas ────────────────────────────────────────────────────────

router.post('/:id/facturas', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { proveedor_id, numero, fecha, total, items } = req.body;
    if (!proveedor_id) {
      return res.status(400).json({ ok: false, error: 'Elegí el proveedor de la lista' });
    }

    // El proveedor ya no es texto libre: viene de la lista que carga el encargado.
    // De su ficha sale también el vencimiento, que es lo que después ordena los pagos.
    const prov = await pool.query(
      'SELECT nombre, plazo_dias FROM proveedores WHERE id = $1 AND activo = true',
      [proveedor_id]
    );
    if (!prov.rows.length) {
      return res.status(400).json({ ok: false, error: 'Ese proveedor ya no está en la lista' });
    }

    const { rows } = await pool.query('SELECT * FROM reportes WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Reporte no encontrado' });
    const reporte = rows[0];
    if (reporte.usuario_id !== req.user.id) return res.status(403).json({ ok: false, error: 'Este reporte no es tuyo' });
    if (!EDITABLES.includes(reporte.estado)) {
      return res.status(409).json({ ok: false, error: 'El reporte ya fue enviado' });
    }

    // reporte.fecha viene como Date desde pg y la del body como 'YYYY-MM-DD':
    // se normalizan las dos antes de sumarle el plazo.
    const fechaFactura = fecha
      ? String(fecha).slice(0, 10)
      : [
          reporte.fecha.getFullYear(),
          String(reporte.fecha.getMonth() + 1).padStart(2, '0'),
          String(reporte.fecha.getDate()).padStart(2, '0'),
        ].join('-');

    const vence = new Date(`${fechaFactura}T00:00:00`);
    vence.setDate(vence.getDate() + prov.rows[0].plazo_dias);
    const vencimiento = `${vence.getFullYear()}-${String(vence.getMonth() + 1).padStart(2, '0')}-${String(vence.getDate()).padStart(2, '0')}`;

    await client.query('BEGIN');
    const f = await client.query(`
      INSERT INTO facturas (local_id, reporte_id, proveedor, proveedor_id, numero, fecha, vencimiento, total, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id
    `, [
      reporte.local_id, reporte.id, prov.rows[0].nombre, proveedor_id, numero?.trim() || null,
      fechaFactura, vencimiento, Number(total) || 0, req.user.id,
    ]);

    for (const it of (items || [])) {
      if (!it.producto?.trim()) continue;
      await client.query(`
        INSERT INTO facturas_items (factura_id, producto, cantidad, precio_unit)
        VALUES ($1,$2,$3,$4)
      `, [f.rows[0].id, it.producto.trim(), Number(it.cantidad) || 1, Number(it.precio_unit) || 0]);
    }
    await client.query('COMMIT');

    res.status(201).json({ ok: true, data: { id: f.rows[0].id } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[reportes/facturas]', err);
    res.status(500).json({ ok: false, error: 'Error al guardar la factura' });
  } finally {
    client.release();
  }
});

// ── DELETE /facturas/:id ──────────────────────────────────────────────────────

router.delete('/facturas/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT f.id, r.usuario_id, r.estado FROM facturas f
      JOIN reportes r ON r.id = f.reporte_id
      WHERE f.id = $1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Factura no encontrada' });
    if (rows[0].usuario_id !== req.user.id) return res.status(403).json({ ok: false, error: 'Sin acceso' });
    if (!EDITABLES.includes(rows[0].estado)) {
      return res.status(409).json({ ok: false, error: 'El reporte ya fue enviado' });
    }
    await pool.query('DELETE FROM facturas WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[reportes/facturas DELETE]', err);
    res.status(500).json({ ok: false, error: 'Error al borrar la factura' });
  }
});

// ── POST /:id/enviar ──────────────────────────────────────────────────────────

router.post('/:id/enviar', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM reportes WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Reporte no encontrado' });

    const reporte = rows[0];
    if (reporte.usuario_id !== req.user.id) return res.status(403).json({ ok: false, error: 'Este reporte no es tuyo' });
    if (!EDITABLES.includes(reporte.estado)) {
      return res.status(409).json({ ok: false, error: 'Este reporte ya fue enviado' });
    }

    const plantilla = await cargarPlantilla(reporte.plantilla_codigo);

    // El turno vive en su propia columna, no en respuestas: se inyecta para que el
    // validador lo encuentre como cualquier otro campo de la plantilla.
    const faltan = validar(plantilla.campos, { ...reporte.respuestas, turno: reporte.turno });

    // Las fotos obligatorias se chequean contra los adjuntos, no contra respuestas.
    const adjuntos = await adjuntosDe(reporte.id);
    for (const campo of plantilla.campos) {
      if (campo.tipo === 'foto' && campo.requerido) {
        if (!adjuntos.some(a => a.campo_codigo === campo.codigo)) faltan.push(campo.label);
      }
    }

    if (faltan.length) {
      return res.status(400).json({ ok: false, error: 'Te falta completar algo', data: { faltan } });
    }

    await pool.query(
      `UPDATE reportes SET estado = 'enviado', enviado_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [reporte.id]
    );
    await pool.query(
      `INSERT INTO reporte_revisiones (reporte_id, usuario_id, accion) VALUES ($1, $2, 'envio')`,
      [reporte.id, req.user.id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[reportes/enviar]', err);
    res.status(500).json({ ok: false, error: 'Error al enviar el reporte' });
  }
});

// ── GET /dia ──────────────────────────────────────────────────────────────────
// Todos los reportes que TENDRÍAN que existir ese día, con o sin carga. Mostrar
// solo los que llegaron esconde justamente lo que hay que ver: el que falta.
//
// Cada tienda espera 2 (mañana y tarde); el café espera 4 (café y cocina, en los
// dos turnos). Sale de las áreas que tienen gente cargando reportes en cada local
// cruzadas con los turnos de su plantilla.

router.get('/dia', requireAuth, requireRol(ROLES.ENCARGADO_GENERAL), async (req, res) => {
  try {
    const fecha = req.query.fecha || hoyStr();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return res.status(400).json({ ok: false, error: 'Fecha inválida' });
    }

    const locales = (await pool.query(
      'SELECT id, nombre, tipo FROM locales WHERE activo = true ORDER BY id'
    )).rows;

    const plantillas = (await pool.query(
      'SELECT codigo, nombre, area, campos FROM reporte_plantillas WHERE activo = true'
    )).rows;

    const areasPorLocal = (await pool.query(`
      SELECT DISTINCT local_id_principal AS local_id, area
      FROM empleados WHERE activo = true AND carga_reporte = true
    `)).rows;

    const cargados = (await pool.query(`
      SELECT r.id, r.plantilla_codigo, r.turno, r.estado, r.local_id, r.enviado_at,
             u.nombre AS usuario_nombre, e.puesto AS usuario_puesto,
             (SELECT COUNT(*)::int FROM reporte_adjuntos a WHERE a.reporte_id = r.id) AS fotos,
             (SELECT COUNT(*)::int FROM facturas f WHERE f.reporte_id = r.id)         AS facturas
      FROM reportes r
      JOIN usuarios u ON u.id = r.usuario_id
      LEFT JOIN empleados e ON e.id = u.empleado_id
      WHERE r.fecha = $1
    `, [fecha])).rows;

    const filas = locales.map(local => {
      const areas = areasPorLocal.filter(a => a.local_id === local.id).map(a => a.area);
      const slots = [];

      for (const area of areas) {
        const p = plantillas.find(x => x.area === area);
        if (!p) continue;
        const turnos = p.campos.find(c => c.codigo === 'turno')?.opciones || ['Único'];
        for (const turno of turnos) {
          const reporte = cargados.find(r =>
            r.local_id === local.id && r.plantilla_codigo === p.codigo && r.turno === turno
          ) || null;
          slots.push({
            plantilla_codigo: p.codigo,
            plantilla_nombre: p.nombre,
            turno,
            // Un borrador todavía no llegó: para el encargado equivale a sin cargar,
            // pero se distingue porque alguien ya lo empezó.
            estado: reporte ? reporte.estado : 'sin_cargar',
            reporte,
          });
        }
      }

      const recibidos = slots.filter(s => ['enviado', 'observado', 'aprobado'].includes(s.estado)).length;
      return {
        local_id: local.id, nombre: local.nombre, tipo: local.tipo,
        esperados: slots.length, recibidos, slots,
      };
    });

    const consolidado = (await pool.query(
      'SELECT fecha::text, estado, cerrado_at, vencimientos_ok, control_tienda_ok FROM consolidados WHERE fecha = $1',
      [fecha]
    )).rows[0] || null;

    const totales = filas.reduce((t, l) => ({
      esperados: t.esperados + l.esperados,
      recibidos: t.recibidos + l.recibidos,
    }), { esperados: 0, recibidos: 0 });

    res.json({ ok: true, data: { fecha, locales: filas, totales, consolidado } });
  } catch (err) {
    console.error('[reportes/dia]', err);
    res.status(500).json({ ok: false, error: 'Error al armar el día' });
  }
});

// ── GET /:id ──────────────────────────────────────────────────────────────────

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, l.nombre AS local_nombre, u.nombre AS usuario_nombre,
             e.puesto AS usuario_puesto
      FROM reportes r
      JOIN locales l ON l.id = r.local_id
      JOIN usuarios u ON u.id = r.usuario_id
      LEFT JOIN empleados e ON e.id = u.empleado_id
      WHERE r.id = $1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Reporte no encontrado' });
    if (!puedeVer(req.user, rows[0])) return res.status(403).json({ ok: false, error: 'Sin acceso' });

    const plantilla = await cargarPlantilla(rows[0].plantilla_codigo);

    // El campo de horas guarda ids. Sin los nombres, quien revisa lee "Empleado #7".
    const equipo = await pool.query(
      'SELECT id, nombre, puesto FROM empleados WHERE local_id_principal = $1',
      [rows[0].local_id]
    );

    res.json({
      ok: true,
      data: {
        ...rows[0],
        plantilla,
        equipo:   equipo.rows,
        adjuntos: await adjuntosDe(rows[0].id),
        facturas: await facturasDe(rows[0].id),
      },
    });
  } catch (err) {
    console.error('[reportes GET :id]', err);
    res.status(500).json({ ok: false, error: 'Error al obtener el reporte' });
  }
});

// ── POST /:id/revisar ─────────────────────────────────────────────────────────

router.post('/:id/revisar', requireAuth, requireRol(ROLES.ENCARGADO_GENERAL), async (req, res) => {
  try {
    const { accion, comentario } = req.body;
    if (!['observo', 'aprobo'].includes(accion)) {
      return res.status(400).json({ ok: false, error: 'Acción inválida' });
    }
    if (accion === 'observo' && !comentario?.trim()) {
      return res.status(400).json({ ok: false, error: 'Escribí qué tiene que corregir' });
    }

    const { rows } = await pool.query('SELECT estado FROM reportes WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Reporte no encontrado' });
    if (rows[0].estado === 'borrador') {
      return res.status(409).json({ ok: false, error: 'Todavía no lo enviaron' });
    }

    const nuevo = accion === 'aprobo' ? 'aprobado' : 'observado';
    await pool.query('UPDATE reportes SET estado = $1, updated_at = NOW() WHERE id = $2', [nuevo, req.params.id]);
    await pool.query(
      'INSERT INTO reporte_revisiones (reporte_id, usuario_id, accion, comentario) VALUES ($1,$2,$3,$4)',
      [req.params.id, req.user.id, accion, comentario?.trim() || null]
    );

    res.json({ ok: true, data: { estado: nuevo } });
  } catch (err) {
    console.error('[reportes/revisar]', err);
    res.status(500).json({ ok: false, error: 'Error al revisar el reporte' });
  }
});

module.exports = router;
