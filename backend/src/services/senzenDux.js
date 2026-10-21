// Lee Senzen desde Dux de Plumas (API v2) y lo copia a las tablas senzen_*.
//
// Senzen es la sucursal 2 "SENZEN" de la empresa de Plumas y tiene su propio depósito,
// CARMIX. Lo de Senzen que se factura desde Casa Central no se trae: es Plumas
// comprándole a Senzen al costo para revenderlo.
//
// Token y empresa en DUX_API_TOKEN / DUX_EMPRESA_ID (los mismos que usa el sistema de
// Plumas). La API deja 5 pedidos por segundo y 50 resultados por página.

const pool = require('../config/db');
const { hoyStr } = require('../utils/fechas');

const BASE      = 'https://erp.duxsoftware.com.ar/WSERP/rest/services/v2';
const SUCURSAL  = 2;          // "SENZEN"
const DEPOSITO  = 25985;      // "CARMIX"
const DESDE     = '2026-08-01'; // Senzen arrancó a fines de agosto de 2026

const token   = () => (process.env.DUX_API_TOKEN || '').replace(/[^\x21-\x7E]/g, '');
const empresa = () => (process.env.DUX_EMPRESA_ID || '').trim();
const sleep   = ms => new Promise(r => setTimeout(r, ms));

// Dux a veces contesta "Formato desconocido" o 5xx sin motivo: se reintenta.
async function get(ruta, params = {}) {
  const url = new URL(BASE + ruta);
  url.searchParams.set('id_empresa', empresa());
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
  for (let i = 0; i < 6; i++) {
    const r = await fetch(url, { headers: { authorization: 'Bearer ' + token(), accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
    const txt = await r.text();
    if (r.status === 401) throw new Error('Dux no acepta el token (DUX_API_TOKEN).');
    if (r.status === 429 || r.status >= 500 || txt.includes('Formato desconocido')) {
      await sleep(Number(r.headers.get('retry-after')) * 1000 || 1500 * (i + 1));
      continue;
    }
    try { return JSON.parse(txt); } catch { throw new Error(`Dux devolvió algo que no se entiende (${r.status})`); }
  }
  throw new Error(`Dux no respondió ${ruta} después de varios intentos`);
}

async function todos(ruta, params = {}) {
  const out = [];
  for (let offset = 0; ; offset += 50) {
    const j = await get(ruta, { ...params, limit: 50, offset });
    out.push(...(j.datos || []));
    if (!j.paginacion?.hay_mas) return out;
    await sleep(250);
  }
}

const n = v => Number(v) || 0;

// Trae todo lo de Senzen desde el 1/8/2026. Hoy son pocas facturas; cuando crezca se
// puede acotar a los últimos meses (lo viejo ya no cambia).
async function sincronizar() {
  if (!token() || !empresa()) throw new Error('Faltan DUX_API_TOKEN y DUX_EMPRESA_ID');
  const { rows: [run] } = await pool.query('INSERT INTO senzen_sync DEFAULT VALUES RETURNING id');
  try {
    const hasta = hoyStr();
    const [facturas, pedidos, cobros, stock] = [
      await todos('/facturas', { id_sucursal: SUCURSAL, fecha_desde: DESDE, fecha_hasta: hasta, trae_detalles: true }),
      await todos('/pedidos',  { id_sucursal: SUCURSAL, fecha_desde: DESDE, fecha_hasta: hasta }),
      await todos('/cobros',   { id_sucursal: SUCURSAL, fecha_desde: DESDE, fecha_hasta: hasta }),
      await todos('/stock',    { id_deposito: DEPOSITO }),
    ];

    // El costo de cada producto sale del catálogo: Dux no lo pone en la factura.
    const costo = Object.fromEntries((await todos('/items')).map(i => [i.cod_item, n(i.costo)]));

    const cli = await pool.connect();
    try {
      await cli.query('BEGIN');
      for (const f of facturas) {
        await cli.query(`
          INSERT INTO senzen_facturas (id_comp_venta, fecha, comprobante, tipo_comp, id_cliente, total, neto, anulada)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          ON CONFLICT (id_comp_venta) DO UPDATE SET fecha=$2, comprobante=$3, tipo_comp=$4, id_cliente=$5, total=$6, neto=$7, anulada=$8
        `, [f.id_comp_venta, f.fecha, f.comprobante, f.tipo_comp, f.id_cliente, n(f.total), n(f.total) - n(f.monto_iva), !!f.anulada]);
        await cli.query('DELETE FROM senzen_factura_items WHERE id_comp_venta = $1', [f.id_comp_venta]);
        let i = 0;
        for (const d of f.detalles || []) {
          await cli.query(`
            INSERT INTO senzen_factura_items (id_comp_venta, renglon, cod_item, item, cantidad, subtotal, costo)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
          `, [f.id_comp_venta, i++, d.cod_item, d.item || d.descripcion || 'Sin nombre', n(d.ctd),
              n(d.ctd) * n(d.precio_uni) * (1 - n(d.porc_desc) / 100), n(d.ctd) * (costo[d.cod_item] || 0)]);
        }
      }
      for (const p of pedidos) {
        await cli.query(`
          INSERT INTO senzen_pedidos (id_pedido, nro_pedido, fecha, id_cliente, total, estado, anulado)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT (id_pedido) DO UPDATE SET nro_pedido=$2, fecha=$3, id_cliente=$4, total=$5, estado=$6, anulado=$7
        `, [p.id_pedido, p.nro_pedido, p.fecha, p.id_cliente, n(p.total), p.estado_facturacion, !!p.anulado]);
      }
      for (const c of cobros) {
        const imp = (c.imputaciones || []).map(x => ({ id_comp_venta: x.id_comp_venta, monto: n(x.monto_imputado) }));
        await cli.query(`
          INSERT INTO senzen_cobros (id_cobro, fecha, cliente, monto, imputaciones) VALUES ($1,$2,$3,$4,$5)
          ON CONFLICT (id_cobro) DO UPDATE SET fecha=$2, cliente=$3, monto=$4, imputaciones=$5
        `, [c.id_cobro, c.fecha, c.cliente, n(c.monto), JSON.stringify(imp)]);
      }
      // El stock es una foto: se reemplaza entero.
      await cli.query('DELETE FROM senzen_stock');
      for (const s of stock) {
        await cli.query('INSERT INTO senzen_stock (cod_item, item, cantidad, costo) VALUES ($1,$2,$3,$4)',
          [s.cod_item, s.item, n(s.ctd_disponible), costo[s.cod_item] || 0]);
      }
      await cli.query('COMMIT');
    } catch (err) {
      await cli.query('ROLLBACK');
      throw err;
    } finally {
      cli.release();
    }

    const nuevos = await traerClientes([...facturas, ...pedidos].map(x => x.id_cliente));
    const detalle = { facturas: facturas.length, pedidos: pedidos.length, cobros: cobros.length, stock: stock.length, comerciosNuevos: nuevos };
    await pool.query('UPDATE senzen_sync SET termino = NOW(), ok = true, detalle = $2 WHERE id = $1', [run.id, detalle]);
    return detalle;
  } catch (err) {
    await pool.query('UPDATE senzen_sync SET termino = NOW(), ok = false, detalle = $2 WHERE id = $1', [run.id, { error: err.message }]);
    throw err;
  }
}

// Cada cliente de Dux que compra en Senzen queda como comercio. Si Pepa ya lo había
// cargado con el mismo nombre (como prospecto), se engancha a ese en vez de duplicarlo.
async function traerClientes(ids) {
  const { rows } = await pool.query('SELECT dux_id_cliente FROM senzen_comercios WHERE dux_id_cliente IS NOT NULL');
  const ya = new Set(rows.map(r => String(r.dux_id_cliente)));
  let nuevos = 0;
  for (const id of new Set(ids.filter(Boolean).map(String))) {
    if (ya.has(id)) continue;
    const c = (await get('/clientes', { id_cliente: id })).datos?.[0];
    await sleep(210);
    if (!c) continue;
    const nombre = (c.nombre_comercial || c.full_name || c.apellido_razon_social || '').trim();
    if (!nombre) continue;
    const prospecto = await pool.query(
      `SELECT id FROM senzen_comercios WHERE dux_id_cliente IS NULL AND lower(trim(nombre)) = lower($1) LIMIT 1`, [nombre]);
    if (prospecto.rows.length) {
      await pool.query('UPDATE senzen_comercios SET dux_id_cliente = $2, localidad = COALESCE(localidad, $3) WHERE id = $1',
        [prospecto.rows[0].id, id, c.localidad ? titulo(c.localidad) : null]);
    } else {
      // El consumidor final suma en las ventas pero no es un comercio para visitar.
      await pool.query(`
        INSERT INTO senzen_comercios (nombre, localidad, direccion, contacto, telefono, dux_id_cliente, activo)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (dux_id_cliente) DO NOTHING
      `, [titulo(nombre), c.localidad ? titulo(c.localidad) : null, c.domicilio || null, c.persona_contacto || null, c.cel || c.telefono || null, id,
          !/consumidor final/i.test(nombre)]);
    }
    nuevos++;
  }
  return nuevos;
}

// "AROMA Y LIMON" → "Aroma y Limon": las palabras cortas quedan en minúscula.
const titulo = s => s.toLowerCase().replace(/(^|[\s,.(-])(\p{L}+)/gu, (m, a, w, i) => a + (i && ['y', 'de', 'del', 'la', 'el', 'e'].includes(w) ? w : w[0].toUpperCase() + w.slice(1)));

module.exports = { sincronizar };
