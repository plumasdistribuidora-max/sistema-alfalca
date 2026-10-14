'use strict';

const multer = require('multer');
const { uploadToR2 } = require('../config/r2');

// Lo que comparten la factura del turno y la que carga el encargado a mano: la foto,
// el número y el aviso de repetida.

// La factura llega como multipart: los datos en `datos` (JSON) y la foto en `foto`.
// El frontend la achica antes de subirla; el límite es por si alguna pasa entera.
const subirFoto = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) return cb(new Error('La foto de la factura tiene que ser una imagen'));
    cb(null, true);
  },
}).single('foto');

// Envuelve el multer para que un archivo inválido conteste 400 con el motivo, y para
// leer los datos que vienen como texto en el multipart.
function conFoto(req, res, next) {
  subirFoto(req, res, err => {
    if (err) return res.status(400).json({ ok: false, error: err.message });
    if (typeof req.body.datos === 'string') {
      try {
        req.body = { ...JSON.parse(req.body.datos), confirmar_repetida: req.body.confirmar_repetida === 'true' };
      } catch {
        return res.status(400).json({ ok: false, error: 'Los datos de la factura llegaron mal' });
      }
    }
    next();
  });
}

async function guardarFoto(file, facturaId, localId) {
  const ext = (file.mimetype.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '');
  const key = `facturas/${localId}/${facturaId}-${Date.now()}.${ext}`;
  await uploadToR2(key, file.buffer, file.mimetype);
  return { key, mime: file.mimetype };
}

// El número se carga en dos casilleros, punto de venta y número, y se guarda
// "00027-00013674": cinco y ocho dígitos, como lo imprime AFIP. Sin número (notas de
// pedido) va null. Devuelve { numero } o { error }.
function normalizarNumero(valor, sinNumero) {
  if (sinNumero) return { numero: null };
  const m = /^\s*(\d{1,5})\s*-\s*(\d{1,8})\s*$/.exec(String(valor || ''));
  if (!m) return { error: 'Poné el punto de venta y el número de la factura, o tildá que no tiene número' };
  if (!Number(m[2])) return { error: 'El número de la factura no puede ser cero' };
  return { numero: `${m[1].padStart(5, '0')}-${m[2].padStart(8, '0')}` };
}

// Mismas reglas que en Facturas pendientes: mismo proveedor y mismo número (con punto
// de venta), o mismo proveedor, mismo día y mismo total. Las marcadas "es otra" no
// avisan.
const CONDICION_REPETIDA = `
  f2.proveedor_id = $1
  AND NOT f2.repetida_ok
  AND (
    ($2::text LIKE '%-%' AND factura_numero_clave(f2.numero) = $2::text)
    OR (f2.fecha = $3::date AND f2.total = $4::numeric)
  )
`;

async function buscarRepetidas(db, { proveedorId, numero, fecha, total, excluirId = null }) {
  const clave = (await db.query('SELECT factura_numero_clave($1) AS c', [numero])).rows[0].c || '';
  const { rows } = await db.query(`
    SELECT f2.id, f2.numero, f2.fecha::text AS fecha, f2.total,
           l.nombre AS local_nombre,
           CASE WHEN f2.reporte_id IS NOT NULL THEN 'el turno'
                WHEN f2.importado_de IS NOT NULL THEN 'la planilla'
                ELSE 'a mano' END AS origen,
           (SELECT COALESCE(SUM(monto), 0) FROM pagos_proveedor WHERE factura_id = f2.id) AS pagado
    FROM facturas f2
    LEFT JOIN locales l ON l.id = f2.local_id
    WHERE ${CONDICION_REPETIDA}
      AND ($5::int IS NULL OR f2.id <> $5::int)
    ORDER BY f2.fecha DESC, f2.id DESC
    LIMIT 5
  `, [proveedorId, clave, fecha, Number(total) || 0, excluirId]);
  return rows.map(r => ({ ...r, total: Number(r.total), pagado: Number(r.pagado) }));
}

// La respuesta cuando parece repetida: el frontend muestra cuál es y deja guardar igual
// reenviando con confirmar_repetida.
function respuestaRepetida(res, repetidas) {
  return res.status(409).json({
    ok: false,
    repetida: repetidas,
    error: 'Ya hay una factura de este proveedor con ese número, o del mismo día por el mismo total.',
  });
}

module.exports = { conFoto, guardarFoto, normalizarNumero, buscarRepetidas, respuestaRepetida };
