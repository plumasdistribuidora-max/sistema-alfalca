const express  = require('express');
const multer   = require('multer');
const xlsx     = require('xlsx');
const pool     = require('../config/db');
const { uploadToR2 } = require('../config/r2');
const { requireAuth, canAccessLocal } = require('../middleware/auth');
const { calcularDocenas } = require('../utils/docenas');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// ── Helpers ────────────────────────────────────────────────────────────────

function parseExcelDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val) ? null : val;
  if (typeof val === 'number') {
    return new Date(Math.round((val - 25569) * 86400 * 1000));
  }
  if (typeof val === 'string' && val.trim()) {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function normalizeEstado(val) {
  if (!val) return 'cerrada';
  const v = val.toString().toLowerCase().trim();
  if (v === 'cerrada')   return 'cerrada';
  if (v === 'eliminada') return 'eliminada';
  if (v.includes('curso')) return 'en_curso';
  return 'cerrada';
}

function parseFiscal(val) {
  if (!val) return false;
  return val.toString().toLowerCase().trim() === 'si';
}

function getCol(row, ...names) {
  for (const n of names) {
    if (row[n] !== null && row[n] !== undefined) return row[n];
  }
  return null;
}

function normalizeNombre(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim();
}

function checkLocalAccess(user, localId) {
  if (user.rol === 'admin') return true;
  return user.locales_permitidos?.includes(parseInt(localId));
}

// Lee una hoja por nombre exacto o parcial (case-insensitive), con header en fila 4 por defecto
function readSheet(wb, sheetName, headerRow = 3) {
  const key = wb.SheetNames.find(n => n.toLowerCase().includes(sheetName.toLowerCase()));
  if (!key) return null;
  return xlsx.utils.sheet_to_json(wb.Sheets[key], { range: headerRow, defval: null });
}

// ── POST /import ───────────────────────────────────────────────────────────

router.post('/import', requireAuth, upload.single('archivo'), async (req, res) => {
  const { local_id } = req.body;
  const resetLocal   = req.query.reset_local === 'true';

  if (!local_id || !req.file)
    return res.status(400).json({ ok: false, error: 'local_id y archivo son requeridos' });

  if (!checkLocalAccess(req.user, local_id))
    return res.status(403).json({ ok: false, error: 'Sin acceso a este local' });

  const localRes = await pool.query('SELECT * FROM locales WHERE id = $1 AND activo = true', [local_id]);
  if (!localRes.rows.length)
    return res.status(404).json({ ok: false, error: 'Local no encontrado' });
  const local = localRes.rows[0];

  // Registrar import como "procesando" (fuera de la transacción para tener ID)
  const logRes = await pool.query(`
    INSERT INTO imports_log (local_id, tipo, archivo_nombre, status, created_by)
    VALUES ($1, 'ventas', $2, 'procesando', $3) RETURNING id
  `, [local_id, req.file.originalname, req.user.id]);
  const importId = logRes.rows[0].id;

  try {
    // ── Parsear Excel ──────────────────────────────────────────────────────
    const wb = xlsx.read(req.file.buffer, { type: 'buffer', cellDates: true });

    // Validar hojas requeridas
    const REQUIRED_SHEETS = ['ventas', 'adiciones', 'pagos', 'descuentos', 'ventas fiscales', 'productos'];
    const missing = REQUIRED_SHEETS.filter(s =>
      !wb.SheetNames.some(n => n.toLowerCase().includes(s))
    );
    if (missing.length) {
      await pool.query("UPDATE imports_log SET status='error', error_detail=$1 WHERE id=$2",
        [JSON.stringify({ error: `Hojas faltantes: ${missing.join(', ')}` }), importId]);
      return res.status(400).json({ ok: false, error: `Hojas faltantes en el Excel: ${missing.join(', ')}` });
    }

    const rowsVentas    = readSheet(wb, 'ventas');
    const rowsAdiciones = readSheet(wb, 'adiciones');
    const rowsPagos     = readSheet(wb, 'pagos');
    const rowsDesc      = readSheet(wb, 'descuentos');
    const rowsFiscales  = readSheet(wb, 'ventas fiscales');
    const rowsProductos = readSheet(wb, 'productos');

    // Log column names para diagnóstico de mapping
    const debugColumns = {};
    if (rowsVentas?.[0])    debugColumns.ventas    = Object.keys(rowsVentas[0]);
    if (rowsAdiciones?.[0]) debugColumns.adiciones = Object.keys(rowsAdiciones[0]);
    if (rowsPagos?.[0])     debugColumns.pagos     = Object.keys(rowsPagos[0]);
    if (rowsDesc?.[0])      debugColumns.descuentos = Object.keys(rowsDesc[0]);
    if (rowsFiscales?.[0])  debugColumns.fiscales  = Object.keys(rowsFiscales[0]);
    if (rowsProductos?.[0]) debugColumns.productos = Object.keys(rowsProductos[0]);
    console.log('[import] columnas detectadas:', JSON.stringify(debugColumns, null, 2));

    // Upload a R2 antes de la transacción (no bloquea DB)
    const fechaStr     = new Date().toISOString().split('T')[0];
    const safeFilename = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const r2Key        = `imports/${local.codigo}/${fechaStr}-${safeFilename}`;
    await uploadToR2(r2Key, req.file.buffer,
      req.file.mimetype || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    // Mapa de empleados para auto-match
    const empRes = await pool.query(
      'SELECT id, nombre_pos FROM empleados WHERE local_id_principal = $1 AND activo = true',
      [local_id]
    );
    const empMap = {};
    empRes.rows.forEach(e => { empMap[e.nombre_pos.toLowerCase()] = e.id; });

    // ── TRANSACCIÓN ────────────────────────────────────────────────────────
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // ── RESET OPCIONAL ────────────────────────────────────────────────
      if (resetLocal) {
        await client.query('DELETE FROM ventas_fiscales  WHERE local_id = $1', [local_id]);
        await client.query('DELETE FROM ventas_descuentos WHERE local_id = $1', [local_id]);
        await client.query('DELETE FROM ventas_pagos     WHERE local_id = $1', [local_id]);
        await client.query('DELETE FROM ventas_items     WHERE local_id = $1', [local_id]);
        await client.query('DELETE FROM ventas_tickets   WHERE local_id = $1', [local_id]);
      }

      // ── PASO 1: ventas_tickets ─────────────────────────────────────────
      let ticketsInsertados = 0, ticketsActualizados = 0;
      let fechaDesde = null, fechaHasta = null;
      const ticketIdMap = {}; // pos_id → db id

      for (const row of rowsVentas) {
        const posId = parseInt(getCol(row, 'Id', 'ID', 'id'));
        if (!posId || isNaN(posId)) continue;

        const fecha       = parseExcelDate(getCol(row, 'Fecha'));
        const creacion    = parseExcelDate(getCol(row, 'Creación', 'Creacion', 'Apertura'));
        const cerrada     = parseExcelDate(getCol(row, 'Cerrada', 'Cierre'));
        const estado      = normalizeEstado(getCol(row, 'Estado'));
        const camareroRaw = getCol(row, 'Camarero / Repartidor', 'Camarero', 'Repartidor', 'Mozo');
        const camareroPos = camareroRaw ? camareroRaw.toString().toLowerCase().trim() : null;
        const empleadoId  = camareroPos ? (empMap[camareroPos] ?? null) : null;
        const fiscal      = parseFiscal(getCol(row, 'Fiscal'));
        const total       = parseFloat(getCol(row, 'Total') ?? 0) || 0;
        const personas    = parseInt(getCol(row, 'Personas')) || null;

        if (fecha) {
          const d = new Date(fecha);
          if (!fechaDesde || d < new Date(fechaDesde)) fechaDesde = d.toISOString().split('T')[0];
          if (!fechaHasta || d > new Date(fechaHasta)) fechaHasta = d.toISOString().split('T')[0];
        }

        const upsert = await client.query(`
          INSERT INTO ventas_tickets (
            local_id, pos_id, fecha, creacion, cerrada, caja, estado,
            cliente, mesa, sala, personas, camarero_pos, empleado_id,
            medio_pago, total, fiscal, tipo_venta, comentario, origen, id_origen,
            archivo_import_id, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW())
          ON CONFLICT (local_id, pos_id) DO UPDATE SET
            fecha             = EXCLUDED.fecha,
            creacion          = EXCLUDED.creacion,
            cerrada           = EXCLUDED.cerrada,
            caja              = EXCLUDED.caja,
            estado            = EXCLUDED.estado,
            cliente           = EXCLUDED.cliente,
            mesa              = EXCLUDED.mesa,
            sala              = EXCLUDED.sala,
            personas          = EXCLUDED.personas,
            camarero_pos      = EXCLUDED.camarero_pos,
            empleado_id       = COALESCE(EXCLUDED.empleado_id, ventas_tickets.empleado_id),
            medio_pago        = EXCLUDED.medio_pago,
            total             = EXCLUDED.total,
            fiscal            = EXCLUDED.fiscal,
            tipo_venta        = EXCLUDED.tipo_venta,
            comentario        = EXCLUDED.comentario,
            origen            = EXCLUDED.origen,
            id_origen         = EXCLUDED.id_origen,
            archivo_import_id = EXCLUDED.archivo_import_id,
            updated_at        = NOW()
          RETURNING id, (xmax = 0) AS inserted
        `, [
          local_id, posId, fecha, creacion, cerrada,
          getCol(row, 'Caja') || null, estado,
          getCol(row, 'Cliente') || null,
          getCol(row, 'Mesa') || null,
          getCol(row, 'Sala') || null,
          personas, camareroPos || null, empleadoId,
          getCol(row, 'Medio de Pago', 'Medio Pago') || null,
          total, fiscal,
          getCol(row, 'Tipo de Venta', 'Tipo Venta') || null,
          getCol(row, 'Comentario') || null,
          getCol(row, 'Origen') || null,
          getCol(row, 'Id. Origen', 'Id Origen') || null,
          importId,
        ]);

        const { id: dbId, inserted } = upsert.rows[0];
        ticketIdMap[posId] = dbId;
        inserted ? ticketsInsertados++ : ticketsActualizados++;
      }

      // ── PASO 2: productos_catalogo ─────────────────────────────────────
      let productosNuevos = 0;
      const productoIdMap = {}; // nombre_normalizado → db id

      for (const row of rowsProductos) {
        const nombreRaw = getCol(row, 'Nombre', 'nombre', 'Producto', 'producto');
        if (!nombreRaw) continue;

        const nombreNorm    = normalizeNombre(nombreRaw);
        const nombreDisplay = nombreRaw.toString().trim();
        const cantidad      = parseFloat(getCol(row, 'Cantidad', 'cantidad') ?? 1) || 1;
        const totalProd     = parseFloat(getCol(row, 'Total', 'total') ?? 0) || 0;
        const precioProm    = cantidad > 0 ? Math.round((totalProd / cantidad) * 100) / 100 : null;

        const { docenas, esAdicional, regla } = calcularDocenas(nombreDisplay);

        const r = await client.query(`
          INSERT INTO productos_catalogo
            (nombre_normalizado, nombre_display, categoria, subcategoria, codigo_pos,
             docenas_por_unidad, es_adicional, regla_descripcion, precio_promedio)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT (nombre_normalizado) DO UPDATE SET
            precio_promedio   = COALESCE($9, productos_catalogo.precio_promedio),
            docenas_por_unidad = $6,
            regla_descripcion  = $8,
            updated_at         = NOW()
          RETURNING id, (xmax = 0) AS inserted
        `, [
          nombreNorm, nombreDisplay,
          getCol(row, 'Categoría', 'Categoria', 'categoria') || null,
          getCol(row, 'Subcategoría', 'Subcategoria', 'subcategoria') || null,
          getCol(row, 'Código', 'Codigo', 'codigo', 'Id', 'ID') || null,
          docenas, esAdicional, regla, precioProm,
        ]);

        const { id: prodId, inserted } = r.rows[0];
        productoIdMap[nombreNorm] = prodId;
        if (inserted) productosNuevos++;
      }

      // ── PASO 3: ventas_items (Adiciones) ──────────────────────────────
      let itemsInsertados = 0, itemsCancelados = 0;

      for (const row of rowsAdiciones) {
        const posTicketId = parseInt(getCol(row, 'Id Ticket', 'IdTicket', 'Id de Ticket', 'id ticket', 'Ticket'));
        const nombreRaw   = getCol(row, 'Nombre', 'nombre', 'Producto', 'producto', 'Adición', 'Adicion');
        if (!posTicketId || isNaN(posTicketId) || !nombreRaw) continue;

        const nombreNorm     = normalizeNombre(nombreRaw);
        const productoId     = productoIdMap[nombreNorm] ?? null;
        const docenasProd    = productoId
          ? (await client.query('SELECT docenas_por_unidad FROM productos_catalogo WHERE id=$1', [productoId])).rows[0]?.docenas_por_unidad ?? 0
          : calcularDocenas(nombreRaw).docenas;
        const cantidad       = parseFloat(getCol(row, 'Cantidad', 'cantidad') ?? 1) || 1;
        const docenasEq      = cantidad * parseFloat(docenasProd);
        const cancelada      = parseFiscal(getCol(row, 'Cancelada', 'cancelada', 'Anulada'));
        if (cancelada) itemsCancelados++;

        const fechaCreacion = parseExcelDate(getCol(row, 'Fecha de creación', 'Fecha Creacion', 'Creación', 'Creacion', 'Fecha'));
        const ticketDbId    = ticketIdMap[posTicketId] ?? null;

        try {
          await client.query(`
            INSERT INTO ventas_items (
              local_id, ticket_id, pos_ticket_id, producto_id, producto_nombre_raw,
              categoria_raw, cantidad, precio_unit, precio_total,
              costo_base, costo_modificadores, costo_total,
              empleado, fecha_creacion, cocina,
              cancelada, cancelada_por, comentario, comentario_cancelacion,
              docenas_equivalentes
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
            ON CONFLICT (local_id, pos_ticket_id, producto_nombre_raw, fecha_creacion) DO NOTHING
          `, [
            local_id, ticketDbId, posTicketId, productoId,
            nombreRaw.toString().trim(),
            getCol(row, 'Categoría', 'Categoria', 'categoria') || null,
            cantidad,
            parseFloat(getCol(row, 'Precio Unitario', 'Precio Unit', 'Precio', 'precio') ?? 0) || 0,
            parseFloat(getCol(row, 'Total', 'total', 'Precio Total') ?? 0) || 0,
            parseFloat(getCol(row, 'Costo Base', 'costo base') ?? 0) || 0,
            parseFloat(getCol(row, 'Costo Modificadores', 'costo modificadores') ?? 0) || 0,
            parseFloat(getCol(row, 'Costo Total', 'costo total') ?? 0) || 0,
            getCol(row, 'Creada por', 'Empleado', 'empleado', 'Creado por') || null,
            fechaCreacion,
            getCol(row, 'Cocina', 'cocina') || null,
            cancelada,
            getCol(row, 'Cancelada por', 'Cancelado por') || null,
            getCol(row, 'Comentario', 'comentario') || null,
            getCol(row, 'Comentario Cancelación', 'Comentario Cancelacion') || null,
            docenasEq,
          ]);
          itemsInsertados++;
        } catch (_) { /* ON CONFLICT DO NOTHING ya maneja duplicados */ }
      }

      // ── PASO 4: ventas_pagos ───────────────────────────────────────────
      let pagosInsertados = 0, pagosMixtos = 0;
      const pagosContar = {}; // pos_ticket_id → count

      for (const row of rowsPagos) {
        const posTicketId = parseInt(getCol(row, 'Id Ticket', 'IdTicket', 'Id de Ticket', 'id ticket', 'Ticket'));
        const medioPago   = getCol(row, 'Medio de Pago', 'Medio Pago', 'MedioPago', 'Tipo');
        const monto       = parseFloat(getCol(row, 'Monto', 'monto', 'Total', 'total', 'Importe') ?? 0);
        if (!posTicketId || isNaN(posTicketId) || !medioPago || isNaN(monto)) continue;

        const fechaPago  = parseExcelDate(getCol(row, 'Fecha', 'fecha', 'Fecha de Pago'));
        const ticketDbId = ticketIdMap[posTicketId] ?? null;
        const cancelado  = parseFiscal(getCol(row, 'Cancelado', 'cancelado', 'Anulado'));

        pagosContar[posTicketId] = (pagosContar[posTicketId] || 0) + 1;

        try {
          await client.query(`
            INSERT INTO ventas_pagos (local_id, ticket_id, pos_ticket_id, medio_pago, monto, fecha_pago, cancelado)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT (local_id, pos_ticket_id, medio_pago, monto, fecha_pago) DO NOTHING
          `, [local_id, ticketDbId, posTicketId, medioPago.toString().trim(), monto, fechaPago, cancelado]);
          pagosInsertados++;
        } catch (_) {}
      }
      pagosMixtos = Object.values(pagosContar).filter(c => c > 1).length;

      // ── PASO 5: ventas_descuentos ──────────────────────────────────────
      let descInsertados = 0;
      let descTotalPesos = 0;

      for (const row of rowsDesc) {
        const posTicketId = parseInt(getCol(row, 'Id Ticket', 'IdTicket', 'Id de Ticket', 'id ticket', 'Ticket'));
        if (!posTicketId || isNaN(posTicketId)) continue;

        const valor      = parseFloat(getCol(row, 'Valor', 'valor', 'Monto', 'Descuento') ?? 0) || null;
        const porcentaje = parseFloat(getCol(row, 'Porcentaje', 'porcentaje', '%') ?? 0) || null;
        const fechaDesc  = parseExcelDate(getCol(row, 'Fecha', 'fecha'));
        const cancelado  = parseFiscal(getCol(row, 'Cancelado', 'cancelado', 'Anulado'));
        const ticketDbId = ticketIdMap[posTicketId] ?? null;

        await client.query(`
          INSERT INTO ventas_descuentos (local_id, ticket_id, pos_ticket_id, valor, porcentaje, fecha_descuento, cancelado)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT DO NOTHING
        `, [local_id, ticketDbId, posTicketId, valor, porcentaje, fechaDesc, cancelado]);
        descInsertados++;
        if (valor) descTotalPesos += Math.abs(valor);
      }

      // ── PASO 6: ventas_fiscales ────────────────────────────────────────
      let fiscalesInsertados = 0;

      for (const row of rowsFiscales) {
        const posTicketId = parseInt(getCol(row, 'Id Ticket', 'IdTicket', 'Id de Ticket', 'id ticket', 'Ticket', 'Id'));
        if (!posTicketId || isNaN(posTicketId)) continue;

        const numeroDoc  = getCol(row, 'Número', 'Numero', 'Nro', 'numero_doc', 'Comprobante');
        const ticketDbId = ticketIdMap[posTicketId] ?? null;

        try {
          await client.query(`
            INSERT INTO ventas_fiscales (
              local_id, ticket_id, pos_ticket_id,
              tipo_doc, letra_doc, numero_doc, condicion_iva,
              nombre_cliente, cuit_cliente,
              total_sin_impuestos, total_iva, total, iva_105, iva_21,
              fecha_creacion
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
            ON CONFLICT (local_id, pos_ticket_id, numero_doc) DO NOTHING
          `, [
            local_id, ticketDbId, posTicketId,
            getCol(row, 'Tipo', 'tipo', 'Tipo Doc', 'Tipo de Doc') || null,
            getCol(row, 'Letra', 'letra') || null,
            numeroDoc ? numeroDoc.toString().trim() : null,
            getCol(row, 'Condición IVA', 'Condicion IVA', 'IVA', 'Condicion') || null,
            getCol(row, 'Cliente', 'cliente', 'Nombre', 'Razón Social', 'Razon Social') || null,
            getCol(row, 'CUIT', 'cuit') || null,
            parseFloat(getCol(row, 'Total sin Impuestos', 'Neto', 'Sin IVA') ?? 0) || null,
            parseFloat(getCol(row, 'Total IVA', 'IVA Total') ?? 0) || null,
            parseFloat(getCol(row, 'Total', 'total', 'Total con IVA') ?? 0) || null,
            parseFloat(getCol(row, 'IVA 10.5', 'IVA 10,5', 'iva_105') ?? 0) || null,
            parseFloat(getCol(row, 'IVA 21', 'iva_21') ?? 0) || null,
            parseExcelDate(getCol(row, 'Fecha', 'fecha', 'Fecha Creación', 'Fecha Creacion')),
          ]);
          fiscalesInsertados++;
        } catch (_) {}
      }

      // ── Cálculos de resumen ────────────────────────────────────────────
      const docenasTotales = rowsAdiciones.reduce((acc, row) => {
        const nombreRaw = getCol(row, 'Nombre', 'nombre', 'Producto', 'producto', 'Adición', 'Adicion');
        const cantidad  = parseFloat(getCol(row, 'Cantidad', 'cantidad') ?? 1) || 1;
        if (!nombreRaw) return acc;
        const nombreNorm = normalizeNombre(nombreRaw);
        const productoId = productoIdMap[nombreNorm];
        const docProd    = productoId ? 0 : calcularDocenas(nombreRaw).docenas;
        return acc + (cantidad * docProd);
      }, 0);

      // Suma docenas desde la DB (incluye las del catálogo)
      const docDbRes = await client.query(`
        SELECT COALESCE(SUM(docenas_equivalentes), 0) AS total
        FROM ventas_items WHERE local_id = $1
      `, [local_id]);
      const docenasTotalesDB = parseFloat(docDbRes.rows[0].total);

      const adicionalesTotal = await client.query(`
        SELECT COUNT(*) AS cnt FROM ventas_items vi
        JOIN productos_catalogo pc ON pc.id = vi.producto_id
        WHERE vi.local_id = $1 AND pc.es_adicional = true
      `, [local_id]);

      await client.query('COMMIT');

      // ── Actualizar imports_log ─────────────────────────────────────────
      await pool.query(`
        UPDATE imports_log SET
          archivo_r2_key     = $1,
          filas_total        = $2,
          filas_insertadas   = $3,
          filas_actualizadas = $4,
          filas_error        = 0,
          status             = 'completado',
          fecha_desde        = $5,
          fecha_hasta        = $6
        WHERE id = $7
      `, [
        r2Key,
        rowsVentas.length + rowsAdiciones.length + rowsPagos.length + rowsDesc.length + rowsFiscales.length,
        ticketsInsertados + itemsInsertados + pagosInsertados + descInsertados + fiscalesInsertados,
        ticketsActualizados,
        fechaDesde, fechaHasta, importId,
      ]);

      return res.json({
        ok: true,
        data: {
          import_id: importId,
          tickets_insertados:          ticketsInsertados,
          tickets_actualizados:        ticketsActualizados,
          items_insertados:            itemsInsertados,
          items_cancelados_detectados: itemsCancelados,
          pagos_insertados:            pagosInsertados,
          pagos_multipago_count:       pagosMixtos,
          descuentos_insertados:       descInsertados,
          descuentos_total_pesos:      Math.round(descTotalPesos * 100) / 100,
          fiscales_insertados:         fiscalesInsertados,
          productos_nuevos_catalogo:   productosNuevos,
          docenas_totales_periodo:     Math.round(docenasTotalesDB * 10000) / 10000,
          adicionales_total:           parseInt(adicionalesTotal.rows[0].cnt),
          fecha_desde:                 fechaDesde,
          fecha_hasta:                 fechaHasta,
          debug_columns:               debugColumns,
        },
      });

    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

  } catch (err) {
    console.error('[import]', err);
    await pool.query(
      "UPDATE imports_log SET status = 'error', error_detail = $1 WHERE id = $2",
      [JSON.stringify({ error: err.message }), importId]
    );
    return res.status(500).json({ ok: false, error: 'Error al procesar el archivo: ' + err.message });
  }
});

// ── GET /imports (historial) ───────────────────────────────────────────────

router.get('/imports', requireAuth, async (req, res) => {
  try {
    const { local_id } = req.query;
    const params = [];
    let where = '';
    if (local_id) { params.push(local_id); where = 'WHERE il.local_id = $1'; }

    const { rows } = await pool.query(`
      SELECT il.*, l.nombre AS local_nombre, u.nombre AS usuario_nombre
      FROM imports_log il
      JOIN locales l ON l.id = il.local_id
      LEFT JOIN usuarios u ON u.id = il.created_by
      ${where}
      ORDER BY il.created_at DESC
      LIMIT 200
    `, params);
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error al obtener historial' });
  }
});

// ── GET / (listado paginado) ───────────────────────────────────────────────

router.get('/', requireAuth, async (req, res) => {
  try {
    const { local_id, desde, hasta, estado, fiscal, medio_pago, empleado_id, page = 1, limit = 50 } = req.query;

    const conditions = [];
    const params     = [];
    const p = (val) => { params.push(val); return `$${params.length}`; };

    if (local_id)   conditions.push(`vt.local_id = ${p(local_id)}`);
    if (desde)      conditions.push(`vt.fecha >= ${p(desde)}`);
    if (hasta)      conditions.push(`vt.fecha <= ${p(hasta)}`);
    if (estado)     conditions.push(`vt.estado = ${p(estado)}`);
    if (fiscal !== undefined && fiscal !== '') conditions.push(`vt.fiscal = ${p(fiscal === 'true')}`);
    if (medio_pago) conditions.push(`vt.medio_pago = ${p(medio_pago)}`);
    if (empleado_id) conditions.push(`vt.empleado_id = ${p(empleado_id)}`);

    const where  = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

    const countRes = await pool.query(`SELECT COUNT(*) FROM ventas_tickets vt ${where}`, params);

    const dataParams = [...params, parseInt(limit), offset];
    const { rows } = await pool.query(`
      SELECT vt.*, l.nombre AS local_nombre, e.nombre AS empleado_nombre
      FROM ventas_tickets vt
      JOIN locales l ON l.id = vt.local_id
      LEFT JOIN empleados e ON e.id = vt.empleado_id
      ${where}
      ORDER BY vt.fecha DESC, vt.pos_id DESC
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
    `, dataParams);

    res.json({
      ok: true,
      data: rows,
      meta: { total: parseInt(countRes.rows[0].count), page: parseInt(page), limit: parseInt(limit) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error al obtener ventas' });
  }
});

// ── GET /resumen ───────────────────────────────────────────────────────────

router.get('/resumen', requireAuth, async (req, res) => {
  try {
    const { local_id, desde, hasta } = req.query;
    if (!local_id || !desde || !hasta)
      return res.status(400).json({ ok: false, error: 'local_id, desde y hasta son requeridos' });

    const [porDia, mixMedios, rankingEmp, totales] = await Promise.all([
      pool.query(`
        SELECT
          fecha,
          COUNT(*)    FILTER (WHERE estado = 'cerrada')                    AS tickets,
          SUM(total)  FILTER (WHERE estado = 'cerrada')                    AS ventas_brutas,
          SUM(total)  FILTER (WHERE estado = 'cerrada' AND fiscal = true)  AS ventas_fiscal,
          SUM(total)  FILTER (WHERE estado = 'cerrada' AND fiscal = false) AS ventas_no_fiscal,
          ROUND(AVG(total) FILTER (WHERE estado = 'cerrada'), 2)           AS ticket_promedio
        FROM ventas_tickets
        WHERE local_id = $1 AND fecha BETWEEN $2 AND $3
        GROUP BY fecha ORDER BY fecha
      `, [local_id, desde, hasta]),

      pool.query(`
        SELECT
          COALESCE(medio_pago, 'Sin especificar') AS medio_pago,
          COUNT(*)   AS tickets,
          SUM(total) AS total
        FROM ventas_tickets
        WHERE local_id = $1 AND fecha BETWEEN $2 AND $3 AND estado = 'cerrada'
        GROUP BY medio_pago ORDER BY total DESC NULLS LAST
      `, [local_id, desde, hasta]),

      pool.query(`
        SELECT
          vt.camarero_pos,
          e.nombre         AS empleado_nombre,
          COUNT(*)         AS tickets,
          SUM(vt.total)    AS total,
          ROUND(AVG(vt.total), 2) AS ticket_promedio
        FROM ventas_tickets vt
        LEFT JOIN empleados e ON e.id = vt.empleado_id
        WHERE vt.local_id = $1 AND vt.fecha BETWEEN $2 AND $3 AND vt.estado = 'cerrada'
          AND vt.camarero_pos IS NOT NULL AND vt.camarero_pos != ''
        GROUP BY vt.camarero_pos, e.nombre
        ORDER BY total DESC NULLS LAST
        LIMIT 15
      `, [local_id, desde, hasta]),

      pool.query(`
        SELECT
          COUNT(*)    FILTER (WHERE estado = 'cerrada')                    AS tickets_total,
          SUM(total)  FILTER (WHERE estado = 'cerrada')                    AS ventas_total,
          SUM(total)  FILTER (WHERE estado = 'cerrada' AND fiscal = true)  AS ventas_fiscal,
          SUM(total)  FILTER (WHERE estado = 'cerrada' AND fiscal = false) AS ventas_no_fiscal,
          ROUND(AVG(total) FILTER (WHERE estado = 'cerrada'), 2)           AS ticket_promedio
        FROM ventas_tickets
        WHERE local_id = $1 AND fecha BETWEEN $2 AND $3
      `, [local_id, desde, hasta]),
    ]);

    res.json({
      ok: true,
      data: {
        totales:           totales.rows[0],
        por_dia:           porDia.rows,
        mix_medios:        mixMedios.rows,
        ranking_empleados: rankingEmp.rows,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error al obtener resumen' });
  }
});

// ── GET /consolidado ───────────────────────────────────────────────────────

router.get('/consolidado', requireAuth, async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta)
      return res.status(400).json({ ok: false, error: 'desde y hasta son requeridos' });

    const { rows } = await pool.query(`
      SELECT
        l.id                                                                   AS local_id,
        l.nombre                                                               AS local_nombre,
        l.codigo,
        l.tipo,
        COUNT(vt.id)    FILTER (WHERE vt.estado = 'cerrada')                   AS tickets,
        SUM(vt.total)   FILTER (WHERE vt.estado = 'cerrada')                   AS ventas_total,
        SUM(vt.total)   FILTER (WHERE vt.estado = 'cerrada' AND vt.fiscal = true)  AS ventas_fiscal,
        SUM(vt.total)   FILTER (WHERE vt.estado = 'cerrada' AND vt.fiscal = false) AS ventas_no_fiscal,
        ROUND(AVG(vt.total) FILTER (WHERE vt.estado = 'cerrada'), 2)           AS ticket_promedio
      FROM locales l
      LEFT JOIN ventas_tickets vt
        ON vt.local_id = l.id AND vt.fecha BETWEEN $1 AND $2
      WHERE l.activo = true
      GROUP BY l.id, l.nombre, l.codigo, l.tipo
      ORDER BY ventas_total DESC NULLS LAST
    `, [desde, hasta]);

    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error al obtener consolidado' });
  }
});

// ── GET /comparativo ──────────────────────────────────────────────────────

router.get('/comparativo', requireAuth, async (req, res) => {
  try {
    const { desde, hasta, agrupacion = 'dia' } = req.query;
    if (!desde || !hasta)
      return res.status(400).json({ ok: false, error: 'desde y hasta son requeridos' });

    const trunc = agrupacion === 'mes'    ? "DATE_TRUNC('month', fecha)"
                : agrupacion === 'semana' ? "DATE_TRUNC('week', fecha)"
                : 'fecha';

    const { rows } = await pool.query(`
      SELECT
        ${trunc}            AS periodo,
        l.id                AS local_id,
        l.nombre            AS local_nombre,
        l.codigo,
        COUNT(*)   FILTER (WHERE vt.estado = 'cerrada') AS tickets,
        SUM(total) FILTER (WHERE vt.estado = 'cerrada') AS ventas_total
      FROM ventas_tickets vt
      JOIN locales l ON l.id = vt.local_id
      WHERE vt.fecha BETWEEN $1 AND $2
      GROUP BY periodo, l.id, l.nombre, l.codigo
      ORDER BY periodo, l.id
    `, [desde, hasta]);

    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error al obtener comparativo' });
  }
});

module.exports = router;
