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
  if (val === null || val === undefined || val === '') return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  return val.toString().toLowerCase().trim() === 'si';
}

// Normaliza una clave de columna: quita tildes, lowercase, special chars → espacio
function normalizeKey(k) {
  return k.toString()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Lee una hoja y devuelve filas con claves normalizadas (header en fila 1 por defecto)
function readSheetNorm(wb, sheetName, headerRow = 0) {
  const key = wb.SheetNames.find(n => n.toLowerCase().includes(sheetName.toLowerCase()));
  if (!key) return [];
  const raw = xlsx.utils.sheet_to_json(wb.Sheets[key], { range: headerRow, defval: null });
  return raw.map(row => {
    const out = {};
    for (const [k, v] of Object.entries(row)) out[normalizeKey(k)] = v;
    return out;
  });
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

    // ── DEBUG: logging exhaustivo de parseo ───────────────────────────────
    const debugLog = [];
    debugLog.push(`SheetNames en workbook: ${JSON.stringify(wb.SheetNames)}`);

    function inspectSheet(label, searchName, headerRow) {
      const matchedName = wb.SheetNames.find(n => n.toLowerCase().includes(searchName.toLowerCase()));
      debugLog.push(`--- ${label} ---`);
      debugLog.push(`  busca: "${searchName}" → match: ${matchedName ? '"' + matchedName + '"' : 'NO MATCH'}`);
      if (!matchedName) return [];
      const raw = xlsx.utils.sheet_to_json(wb.Sheets[matchedName], { range: headerRow, defval: null });
      debugLog.push(`  filas raw (range=${headerRow}): ${raw.length}`);
      if (raw.length > 0) {
        debugLog.push(`  columnas originales: ${JSON.stringify(Object.keys(raw[0]))}`);
        debugLog.push(`  primer row original: ${JSON.stringify(raw[0])}`);
        const normRow = {};
        for (const [k, v] of Object.entries(raw[0])) normRow[normalizeKey(k)] = v;
        debugLog.push(`  columnas normalizadas: ${JSON.stringify(Object.keys(normRow))}`);
        debugLog.push(`  primer row norm: ${JSON.stringify(normRow)}`);
        return raw.map(row => {
          const out = {};
          for (const [k, v] of Object.entries(row)) out[normalizeKey(k)] = v;
          return out;
        });
      }
      // Si 0 filas con range actual, probá otros ranges para diagnóstico
      for (const r of [0, 1, 2, 3, 4]) {
        if (r === headerRow) continue;
        const probe = xlsx.utils.sheet_to_json(wb.Sheets[matchedName], { range: r, defval: null });
        debugLog.push(`  probe range=${r}: ${probe.length} filas, cols: ${probe[0] ? JSON.stringify(Object.keys(probe[0])) : 'N/A'}`);
      }
      return [];
    }

    // Ventas: header en fila 4 (range=3), claves originales (ya funciona)
    const rowsVentas    = readSheet(wb, 'ventas');
    debugLog.push(`--- Ventas (range=3) → ${rowsVentas.length} filas ---`);

    // Subsidiarias: header en fila 1 (range=0), claves normalizadas
    const rowsAdiciones = inspectSheet('Adiciones', 'adiciones', 0);
    const rowsPagos     = inspectSheet('Pagos', 'pagos', 0);
    const rowsDesc      = inspectSheet('Descuentos', 'descuentos', 0);
    const rowsFiscales  = inspectSheet('Ventas Fiscales', 'ventas fiscales', 0);
    const rowsProductos = inspectSheet('Productos', 'productos', 0);

    console.log('[import debug]\n' + debugLog.join('\n'));

    const debugColumns = { _log: debugLog };

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
      // Columnas normalizadas: nombre, categoria, subcategoria, codigo, cantidad, total
      // "Total ($)" → normaliza a "total"
      let productosNuevos = 0;
      const productoIdMap = {}; // nombre_normalizado → db id
      const docenasMap    = {}; // db id → docenas_por_unidad

      for (const row of rowsProductos) {
        const nombreRaw = row['nombre'];
        if (!nombreRaw) continue;

        const nombreNorm    = normalizeNombre(nombreRaw);
        const nombreDisplay = nombreRaw.toString().trim();
        const cantidad      = parseFloat(row['cantidad'] ?? 1) || 1;
        const totalProd     = parseFloat(row['total'] ?? 0) || 0;
        const precioProm    = cantidad > 0 ? Math.round((totalProd / cantidad) * 100) / 100 : null;

        const { docenas, esAdicional, regla } = calcularDocenas(nombreDisplay);

        const r = await client.query(`
          INSERT INTO productos_catalogo
            (nombre_normalizado, nombre_display, categoria, subcategoria, codigo_pos,
             docenas_por_unidad, es_adicional, regla_descripcion, precio_promedio)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT (nombre_normalizado) DO UPDATE SET
            precio_promedio    = COALESCE($9, productos_catalogo.precio_promedio),
            docenas_por_unidad = $6,
            regla_descripcion  = $8,
            updated_at         = NOW()
          RETURNING id, (xmax = 0) AS inserted
        `, [
          nombreNorm, nombreDisplay,
          row['categoria'] || null,
          row['subcategoria'] || null,
          row['codigo'] || null,
          docenas, esAdicional, regla, precioProm,
        ]);

        const { id: prodId, inserted } = r.rows[0];
        productoIdMap[nombreNorm] = prodId;
        docenasMap[prodId]        = docenas;
        if (inserted) productosNuevos++;
      }

      // ── PASO 3: ventas_items (Adiciones) ──────────────────────────────
      // Columnas norm: "id venta", "creacion", "producto", "categoria",
      // "cantidad", "precio", "costo base", "costo modificadores", "costo total",
      // "creada por", "cocina", "cancelada", "cancelada por", "comentario",
      // "comentario de cancelacion"
      let itemsInsertados = 0, itemsCancelados = 0;

      for (const row of rowsAdiciones) {
        const posTicketId = parseInt(row['id venta']);
        const nombreRaw   = row['producto'];
        if (!posTicketId || isNaN(posTicketId) || !nombreRaw) continue;

        const nombreNorm  = normalizeNombre(nombreRaw);
        const productoId  = productoIdMap[nombreNorm] ?? null;
        const docenasProd = productoId ? (docenasMap[productoId] ?? 0) : calcularDocenas(nombreRaw).docenas;
        const cantidad    = parseFloat(row['cantidad'] ?? 1) || 1;
        const precioUnit  = parseFloat(row['precio'] ?? 0) || 0;
        const docenasEq   = cantidad * parseFloat(docenasProd);
        const cancelada   = parseFiscal(row['cancelada']);
        if (cancelada) itemsCancelados++;

        const fechaCreacion = parseExcelDate(row['creacion']);
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
            row['categoria'] || null,
            cantidad,
            precioUnit,
            cantidad * precioUnit,           // precio_total calculado (no hay col aparte)
            parseFloat(row['costo base'] ?? 0) || 0,
            parseFloat(row['costo modificadores'] ?? 0) || 0,
            parseFloat(row['costo total'] ?? 0) || 0,
            row['creada por'] || null,
            fechaCreacion,
            row['cocina'] || null,
            cancelada,
            row['cancelada por'] || null,
            row['comentario'] || null,
            row['comentario de cancelacion'] || null,
            docenasEq,
          ]);
          itemsInsertados++;
        } catch (_) { /* ON CONFLICT DO NOTHING */ }
      }

      // ── PASO 4: ventas_pagos ───────────────────────────────────────────
      // Columnas norm: "id venta", "fecha pago", "medio de pago", "monto", "cancelado"
      let pagosInsertados = 0, pagosMixtos = 0;
      const pagosContar = {};

      for (const row of rowsPagos) {
        const posTicketId = parseInt(row['id venta']);
        const medioPago   = row['medio de pago'];
        const monto       = parseFloat(row['monto'] ?? 0);
        if (!posTicketId || isNaN(posTicketId) || !medioPago || isNaN(monto)) continue;

        const fechaPago  = parseExcelDate(row['fecha pago']);
        const ticketDbId = ticketIdMap[posTicketId] ?? null;
        const cancelado  = parseFiscal(row['cancelado']);

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
      // Columnas norm: "id venta", "valor", "porcentaje", "creacion descuento", "cancelado"
      let descInsertados = 0;
      let descTotalPesos = 0;

      for (const row of rowsDesc) {
        const posTicketId = parseInt(row['id venta']);
        if (!posTicketId || isNaN(posTicketId)) continue;

        const valor      = parseFloat(row['valor'] ?? 0) || null;
        const porcentaje = parseFloat(row['porcentaje'] ?? 0) || null;
        const fechaDesc  = parseExcelDate(row['creacion descuento']);
        const cancelado  = parseFiscal(row['cancelado']);
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
      // Columnas norm: "id venta", "creacion", "tipo doc", "letra doc", "n doc",
      // "condicion iva", "nombre cliente", "cuit cuil dni",
      // "total sin impuestos", "total iva", "total", "iva 10 5", "iva 21"
      let fiscalesInsertados = 0;

      for (const row of rowsFiscales) {
        const posTicketId = parseInt(row['id venta']);
        if (!posTicketId || isNaN(posTicketId)) continue;

        const numeroDoc  = row['n doc'];
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
            row['tipo doc'] || null,
            row['letra doc'] || null,
            numeroDoc ? numeroDoc.toString().trim() : null,
            row['condicion iva'] || null,
            row['nombre cliente'] || null,
            row['cuit cuil dni'] || null,
            parseFloat(row['total sin impuestos'] ?? 0) || null,
            parseFloat(row['total iva'] ?? 0) || null,
            parseFloat(row['total'] ?? 0) || null,
            parseFloat(row['iva 10 5'] ?? 0) || null,
            parseFloat(row['iva 21'] ?? 0) || null,
            parseExcelDate(row['creacion']),
          ]);
          fiscalesInsertados++;
        } catch (_) {}
      }

      // ── Cálculos de resumen ────────────────────────────────────────────

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

// ── GET /descuentos-resumen ────────────────────────────────────────────────

router.get('/descuentos-resumen', requireAuth, async (req, res) => {
  const TZ = 'America/Argentina/Mendoza';
  try {
    const { local_id, desde: dq, hasta: hq } = req.query;
    if (!local_id) return res.status(400).json({ ok: false, error: 'local_id es requerido' });
    const desde = dq || new Date().toISOString().slice(0, 8) + '01';
    const hasta  = hq || new Date().toISOString().split('T')[0];

    const lr = await pool.query('SELECT id FROM locales WHERE id = $1 AND activo = true', [local_id]);
    if (!lr.rows.length) return res.status(404).json({ ok: false, error: 'Local no encontrado' });

    const params = [local_id, desde, hasta];
    const where  = `local_id = $1 AND DATE(fecha_descuento AT TIME ZONE '${TZ}') BETWEEN $2::date AND $3::date AND cancelado = false`;

    const [totRes, diaRes] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)                                                                     AS total_descuentos,
          COALESCE(SUM(ABS(valor)), 0)                                                AS monto_total,
          ROUND(AVG(porcentaje) FILTER (WHERE porcentaje IS NOT NULL AND porcentaje != 0), 2)
                                                                                      AS porcentaje_promedio,
          COUNT(*) FILTER (WHERE porcentaje IS NOT NULL AND porcentaje != 0)          AS descuentos_con_porcentaje,
          COUNT(*) FILTER (WHERE (porcentaje IS NULL OR porcentaje = 0) AND valor IS NOT NULL AND valor != 0)
                                                                                      AS descuentos_monto_fijo
        FROM ventas_descuentos
        WHERE ${where}
      `, params),

      pool.query(`
        SELECT
          DATE_TRUNC('day', fecha_descuento AT TIME ZONE '${TZ}')::date AS fecha,
          COUNT(*)                                                        AS descuentos,
          COALESCE(SUM(ABS(valor)), 0)                                   AS monto
        FROM ventas_descuentos
        WHERE ${where} AND fecha_descuento IS NOT NULL
        GROUP BY fecha
        ORDER BY fecha
      `, params),
    ]);

    const t = totRes.rows[0];
    res.json({
      ok: true,
      data: {
        total_descuentos:          Number(t.total_descuentos) || 0,
        monto_total:               Number(t.monto_total) || 0,
        porcentaje_promedio:       Number(t.porcentaje_promedio) || 0,
        descuentos_con_porcentaje: Number(t.descuentos_con_porcentaje) || 0,
        descuentos_monto_fijo:     Number(t.descuentos_monto_fijo) || 0,
        por_dia: diaRes.rows.map(r => ({
          fecha:      r.fecha,
          descuentos: Number(r.descuentos),
          monto:      Number(r.monto),
        })),
      },
    });
  } catch (err) {
    console.error('[ventas/descuentos-resumen]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /fiscales-resumen ──────────────────────────────────────────────────

router.get('/fiscales-resumen', requireAuth, async (req, res) => {
  const TZ = 'America/Argentina/Mendoza';
  try {
    const { local_id, desde: dq, hasta: hq } = req.query;
    if (!local_id) return res.status(400).json({ ok: false, error: 'local_id es requerido' });
    const desde = dq || new Date().toISOString().slice(0, 8) + '01';
    const hasta  = hq || new Date().toISOString().split('T')[0];

    const lr = await pool.query('SELECT id FROM locales WHERE id = $1 AND activo = true', [local_id]);
    if (!lr.rows.length) return res.status(404).json({ ok: false, error: 'Local no encontrado' });

    const params = [local_id, desde, hasta];

    const [fiscRes, tickRes] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)                                                           AS total_comprobantes,
          COUNT(*)      FILTER (WHERE letra_doc = 'A')                      AS fa_count,
          COALESCE(SUM(total)     FILTER (WHERE letra_doc = 'A'), 0)        AS fa_monto,
          COALESCE(SUM(total_iva) FILTER (WHERE letra_doc = 'A'), 0)        AS fa_iva,
          COUNT(*)      FILTER (WHERE letra_doc = 'B')                      AS fb_count,
          COALESCE(SUM(total)     FILTER (WHERE letra_doc = 'B'), 0)        AS fb_monto,
          COALESCE(SUM(total_iva) FILTER (WHERE letra_doc = 'B'), 0)        AS fb_iva,
          COUNT(*)      FILTER (WHERE letra_doc NOT IN ('A','B') OR letra_doc IS NULL) AS otros_count,
          COALESCE(SUM(total) FILTER (WHERE letra_doc NOT IN ('A','B') OR letra_doc IS NULL), 0)
                                                                             AS otros_monto,
          COALESCE(SUM(total_iva), 0)                                        AS iva_total_periodo
        FROM ventas_fiscales
        WHERE local_id = $1
          AND DATE(fecha_creacion AT TIME ZONE '${TZ}') BETWEEN $2::date AND $3::date
      `, params),

      pool.query(`
        SELECT
          COALESCE(SUM(total) FILTER (WHERE fiscal = true  AND estado = 'cerrada'), 0) AS ventas_fiscal,
          COALESCE(SUM(total) FILTER (WHERE               estado = 'cerrada'), 0)      AS ventas_total
        FROM ventas_tickets
        WHERE local_id = $1 AND fecha BETWEEN $2::date AND $3::date
      `, params),
    ]);

    const f  = fiscRes.rows[0];
    const vt = tickRes.rows[0];
    const vTotal  = Number(vt.ventas_total)  || 0;
    const vFiscal = Number(vt.ventas_fiscal) || 0;

    res.json({
      ok: true,
      data: {
        total_comprobantes:   Number(f.total_comprobantes) || 0,
        facturas_a:           { count: Number(f.fa_count), monto_total: Number(f.fa_monto), iva_total: Number(f.fa_iva) },
        facturas_b:           { count: Number(f.fb_count), monto_total: Number(f.fb_monto), iva_total: Number(f.fb_iva) },
        otros:                { count: Number(f.otros_count), monto_total: Number(f.otros_monto) },
        monto_no_facturado:   Math.max(0, vTotal - vFiscal),
        porcentaje_facturado: vTotal > 0 ? Math.round(vFiscal / vTotal * 1000) / 10 : 0,
        iva_total_periodo:    Number(f.iva_total_periodo) || 0,
      },
    });
  } catch (err) {
    console.error('[ventas/fiscales-resumen]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
