// Senzen: los números para los dueños, la semana de Pepa y las tareas de a quién volver a hablar.

const pool = require('../config/db');
const { hoyStr } = require('../utils/fechas');

const sumarDias = (iso, d) => {
  const x = new Date(iso + 'T12:00:00Z');
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
};
const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);
// Lunes de la semana de una fecha.
const lunes = iso => sumarDias(iso, -((new Date(iso + 'T12:00:00Z').getUTCDay() + 6) % 7));

const DIAS_SEGUNDA = 15;   // segunda visita después de la primera compra
const DIAS_DORMIDO = 30;   // sin comprar, como mínimo (o el doble de lo que tarda en volver)

async function metas() {
  const { rows } = await pool.query(`SELECT clave, valor FROM parametros WHERE clave LIKE 'senzen_meta_%'`);
  const m = Object.fromEntries(rows.map(r => [r.clave.replace('senzen_meta_', ''), r.valor === '' ? null : Number(r.valor)]));
  return { contactos: m.contactos ?? null, nuevos: m.nuevos ?? null, ventas: m.ventas ?? null };
}

// Compras por comercio: primera, última, cuántas y cada cuánto vuelve.
async function compras() {
  const { rows } = await pool.query(`
    SELECT c.id, to_char(MIN(f.fecha),'YYYY-MM-DD') AS primera, to_char(MAX(f.fecha),'YYYY-MM-DD') AS ultima,
           COUNT(DISTINCT f.fecha)::int AS compras, SUM(f.total)::float AS total
    FROM senzen_comercios c JOIN senzen_facturas f ON f.id_cliente = c.dux_id_cliente AND NOT f.anulada
    GROUP BY c.id`);
  return Object.fromEntries(rows.map(r => [r.id, r]));
}

// ── Tareas ───────────────────────────────────────────────────────────────────

// Las que arma el sistema solo: segunda visita y clientes dormidos. Las de "volver" y
// "va a comprar" nacen cuando Pepa carga un contacto (registrarContacto).
async function generarTareas() {
  const hoy = hoyStr();
  const C = await compras();
  const { rows: ult } = await pool.query(`
    SELECT comercio_id, to_char(MAX(fecha),'YYYY-MM-DD') AS ultimo FROM senzen_contactos GROUP BY comercio_id`);
  const ultContacto = Object.fromEntries(ult.map(r => [r.comercio_id, r.ultimo]));
  const { rows: abiertas } = await pool.query(`SELECT comercio_id FROM senzen_tareas WHERE estado = 'pendiente'`);
  const conTarea = new Set(abiertas.map(r => r.comercio_id));
  const { rows: activos } = await pool.query(`SELECT id, consignacion FROM senzen_comercios WHERE activo`);
  let creadas = 0;
  for (const { id } of activos) {
    const c = C[id];
    if (!c || conTarea.has(id)) continue;
    const contacto = ultContacto[id];
    let tipo = null, vence = null;
    if (c.compras === 1) {
      vence = sumarDias(c.primera, DIAS_SEGUNDA);
      if (vence <= sumarDias(hoy, 2) && !(contacto > c.primera)) tipo = 'segunda';
    }
    if (!tipo) {
      // Cada cuánto vuelve a comprar; con una sola compra se usan los 30 días.
      const cada = c.compras > 1 ? diasEntre(c.primera, c.ultima) / (c.compras - 1) : DIAS_DORMIDO;
      const limite = Math.max(DIAS_DORMIDO, Math.round(cada * 2));
      if (diasEntre(c.ultima, hoy) >= limite && !(contacto > sumarDias(hoy, -14))) { tipo = 'dormido'; vence = hoy; }
    }
    if (!tipo) continue;
    const r = await pool.query(`
      INSERT INTO senzen_tareas (comercio_id, tipo, vence) VALUES ($1,$2,$3)
      ON CONFLICT (comercio_id) WHERE estado = 'pendiente' DO NOTHING`, [id, tipo, vence < hoy ? hoy : vence]);
    creadas += r.rowCount;
  }
  return creadas;
}

// Un contacto cierra lo pendiente con ese comercio y, si quedó en volver, abre la próxima.
async function registrarContacto(c, usuarioId) {
  const cli = await pool.connect();
  try {
    await cli.query('BEGIN');
    const { rows: [k] } = await cli.query(`
      INSERT INTO senzen_contactos (comercio_id, usuario_id, fecha, medio, resultado, motivo, volver_el, lat, lng, foto_key, foto_mime)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [c.comercio_id, usuarioId, hoyStr(), c.medio, c.resultado, c.motivo || null, c.volver_el || null,
       c.lat ?? null, c.lng ?? null, c.foto_key || null, c.foto_mime || null]);
    await cli.query(`
      UPDATE senzen_tareas SET estado = 'hecha', contacto_id = $2, cerrada_en = NOW()
      WHERE comercio_id = $1 AND estado = 'pendiente'`, [c.comercio_id, k.id]);
    if (c.volver_el) {
      await cli.query(`INSERT INTO senzen_tareas (comercio_id, tipo, vence, creada_por) VALUES ($1,$2,$3,$4)`,
        [c.comercio_id, c.resultado === 'va_a_comprar' ? 'va_a_comprar' : 'volver', c.volver_el, usuarioId]);
    }
    await cli.query('COMMIT');
    return k.id;
  } catch (err) {
    await cli.query('ROLLBACK');
    throw err;
  } finally {
    cli.release();
  }
}

// Encargo de un dueño. Si ya había algo pendiente con ese comercio, se adelanta la fecha.
async function encargar(comercioId, vence, usuarioId) {
  await pool.query(`
    INSERT INTO senzen_tareas (comercio_id, tipo, vence, creada_por) VALUES ($1,'visitar',$2,$3)
    ON CONFLICT (comercio_id) WHERE estado = 'pendiente'
    DO UPDATE SET vence = LEAST(senzen_tareas.vence, EXCLUDED.vence), tipo = 'visitar', creada_por = EXCLUDED.creada_por`,
    [comercioId, vence, usuarioId]);
}

async function tareasAbiertas() {
  const { rows } = await pool.query(`
    SELECT t.id, t.tipo, to_char(t.vence,'YYYY-MM-DD') AS vence, t.comercio_id,
           c.nombre, c.localidad, c.telefono, c.tipo AS tipo_comercio,
           (SELECT to_char(MAX(fecha),'YYYY-MM-DD') FROM senzen_contactos k WHERE k.comercio_id = c.id) AS ultimo_contacto,
           (SELECT k.resultado FROM senzen_contactos k WHERE k.comercio_id = c.id ORDER BY k.creado_en DESC LIMIT 1) AS ultimo_resultado,
           u.nombre AS encargada_por, u.rol AS rol_encargo
    FROM senzen_tareas t JOIN senzen_comercios c ON c.id = t.comercio_id
    LEFT JOIN usuarios u ON u.id = t.creada_por
    WHERE t.estado = 'pendiente' AND c.activo
    ORDER BY t.vence, c.nombre`);
  const C = await compras();
  return rows.map(r => ({ ...r, ultima_compra: C[r.comercio_id]?.ultima || null, compras: C[r.comercio_id]?.compras || 0 }));
}

// ── Comercios ────────────────────────────────────────────────────────────────

async function comercios() {
  const { rows } = await pool.query(`
    SELECT c.id, c.nombre, c.tipo, c.localidad, c.direccion, c.contacto, c.telefono, c.consignacion, c.activo,
           c.dux_id_cliente, to_char(c.creado_en AT TIME ZONE 'America/Argentina/Mendoza','YYYY-MM-DD') AS creado,
           (SELECT to_char(MAX(fecha),'YYYY-MM-DD') FROM senzen_contactos k WHERE k.comercio_id = c.id) AS ultimo_contacto,
           (SELECT to_char(vence,'YYYY-MM-DD') FROM senzen_tareas t WHERE t.comercio_id = c.id AND t.estado = 'pendiente') AS proxima
    FROM senzen_comercios c ORDER BY c.nombre`);
  const C = await compras();
  return rows.map(r => {
    const k = C[r.id];
    return { ...r, primera_compra: k?.primera || null, ultima_compra: k?.ultima || null, compras: k?.compras || 0,
             estado: k ? (k.compras > 1 ? 'repite' : 'compro') : 'prospecto' };
  });
}

// ── La semana de Pepa ────────────────────────────────────────────────────────

// Contactos, comercios nuevos y pedidos de n semanas (lunes a domingo), desde el lunes `desde`.
// Se trae todo de una vez y se reparte acá: son pocas filas y la base está lejos.
async function semanas(desde, n = 1) {
  const hasta = sumarDias(desde, 7 * n - 1);
  const mza = c => `to_char(${c} AT TIME ZONE 'America/Argentina/Mendoza','YYYY-MM-DD')`;
  const [{ rows: ks }, { rows: cs }, { rows: ps }, { rows: fs }, { rows: ts }] = await Promise.all([
    pool.query(`SELECT to_char(fecha,'YYYY-MM-DD') AS fecha, medio, resultado FROM senzen_contactos WHERE fecha BETWEEN $1 AND $2`, [desde, hasta]),
    pool.query(`SELECT ${mza('creado_en')} AS fecha FROM senzen_comercios WHERE creado_por IS NOT NULL`),
    // Cliente nuevo = su primera compra cae en la semana.
    pool.query(`SELECT to_char(MIN(fecha),'YYYY-MM-DD') AS fecha FROM senzen_facturas WHERE NOT anulada GROUP BY id_cliente`),
    pool.query(`SELECT to_char(fecha,'YYYY-MM-DD') AS fecha, total::float FROM senzen_facturas WHERE NOT anulada AND fecha BETWEEN $1 AND $2`, [desde, hasta]),
    pool.query(`SELECT ${mza('cerrada_en')} AS fecha, to_char(vence,'YYYY-MM-DD') AS vence FROM senzen_tareas WHERE estado = 'hecha'`),
  ]);
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = sumarDias(desde, 7 * i), h = sumarDias(d, 6), en = x => x >= d && x <= h;
    const k = ks.filter(x => en(x.fecha)), t = ts.filter(x => en(x.fecha));
    out.push({
      desde: d, hasta: h,
      contactos: k.length, visitas: k.filter(x => x.medio === 'visita').length, pedidos: k.filter(x => x.resultado === 'pedido').length,
      cargados: cs.filter(x => en(x.fecha)).length, nuevos: ps.filter(x => en(x.fecha)).length,
      ventas: fs.filter(x => en(x.fecha)).reduce((a, x) => a + x.total, 0),
      tareasHechas: t.length, tareasATiempo: t.filter(x => x.fecha <= x.vence).length,
    });
  }
  return out;
}
const semana = async desde => (await semanas(desde, 1))[0];

// Lo que ve Pepa: su semana (sin plata), sus tareas y metas de contactos y nuevos.
async function miSemana() {
  const hoy = hoyStr();
  const [s, tareas, m] = await Promise.all([semana(lunes(hoy)), tareasAbiertas(), metas()]);
  const { ventas, ...sinPlata } = s;
  return { hoy, semana: sinPlata, metas: { contactos: m.contactos, nuevos: m.nuevos }, tareas };
}

// ── Tablero de los dueños ────────────────────────────────────────────────────

async function datos() {
  const hoy = hoyStr();
  const [{ rows: fact }, { rows: items }, { rows: cobros }, { rows: pedidos }, { rows: stock }, { rows: [sync] }, lista, m] = await Promise.all([
    pool.query(`SELECT f.id_comp_venta::text AS id, to_char(f.fecha,'YYYY-MM-DD') AS fecha, f.comprobante, f.total::float, f.neto::float,
                       f.id_cliente::text AS id_cliente, c.id AS comercio_id, c.nombre
                FROM senzen_facturas f LEFT JOIN senzen_comercios c ON c.dux_id_cliente = f.id_cliente
                WHERE NOT f.anulada ORDER BY f.fecha`),
    pool.query(`SELECT i.id_comp_venta::text AS id, i.cod_item, i.item, i.cantidad::float, i.subtotal::float, i.costo::float, to_char(f.fecha,'YYYY-MM-DD') AS fecha
                FROM senzen_factura_items i JOIN senzen_facturas f USING (id_comp_venta) WHERE NOT f.anulada`),
    pool.query(`SELECT imputaciones FROM senzen_cobros`),
    pool.query(`SELECT p.nro_pedido, to_char(p.fecha,'YYYY-MM-DD') AS fecha, p.total::float, p.estado, c.id AS comercio_id, c.nombre, c.consignacion
                FROM senzen_pedidos p LEFT JOIN senzen_comercios c ON c.dux_id_cliente = p.id_cliente
                WHERE NOT p.anulado AND p.estado <> 'FACTURADO' ORDER BY p.fecha`),
    pool.query(`SELECT cod_item, item, cantidad::float, costo::float FROM senzen_stock ORDER BY item`),
    pool.query(`SELECT termino, ok, detalle FROM senzen_sync WHERE termino IS NOT NULL ORDER BY id DESC LIMIT 1`),
    comercios(),
    metas(),
  ]);

  // Lo cobrado de cada factura, por las imputaciones de los cobros.
  const cobrado = {};
  for (const c of cobros) for (const i of c.imputaciones) cobrado[i.id_comp_venta] = (cobrado[i.id_comp_venta] || 0) + i.monto;

  const meses = {};
  const primera = {};
  for (const f of fact) if (!primera[f.id_cliente] || f.fecha < primera[f.id_cliente]) primera[f.id_cliente] = f.fecha;
  for (const f of fact) {
    const p = f.fecha.slice(0, 7);
    const M = meses[p] ||= { total: 0, neto: 0, costo: 0, facturas: 0, clientes: new Set(), nuevos: 0 };
    M.total += f.total; M.neto += f.neto; M.facturas++; M.clientes.add(f.id_cliente);
    if (primera[f.id_cliente] === f.fecha && !M.contados?.has(f.id_cliente)) { M.nuevos++; (M.contados ||= new Set()).add(f.id_cliente); }
  }
  for (const i of items) meses[i.fecha.slice(0, 7)].costo += i.costo;
  // Margen sobre lo que dicen los renglones (cantidad × precio) contra el costo de Dux.
  const subt = {};
  for (const i of items) subt[i.fecha.slice(0, 7)] = (subt[i.fecha.slice(0, 7)] || 0) + i.subtotal;
  const mesesOut = Object.fromEntries(Object.entries(meses).sort().map(([p, M]) => [p, {
    total: M.total, neto: M.neto, facturas: M.facturas, clientes: M.clientes.size, nuevos: M.nuevos,
    margen: subt[p] ? (subt[p] - M.costo) / subt[p] : null,
  }]));

  // Productos: lo vendido, lo que queda y para cuántos días alcanza (ritmo de los últimos 60).
  const desde60 = sumarDias(hoy, -60);
  const prod = {};
  for (const i of items) {
    const k = i.cod_item || i.item;
    const P = prod[k] ||= { cod: i.cod_item, item: i.item, unidades: 0, ventas: 0, costo: 0, u60: 0 };
    P.unidades += i.cantidad; P.ventas += i.subtotal; P.costo += i.costo;
    if (i.fecha >= desde60) P.u60 += i.cantidad;
  }
  for (const s of stock) {
    const P = prod[s.cod_item] ||= { cod: s.cod_item, item: s.item, unidades: 0, ventas: 0, costo: 0, u60: 0 };
    P.stock = s.cantidad; P.costoUnit = s.costo;
  }
  const primeraVenta = fact[0]?.fecha;
  const diasRitmo = primeraVenta ? Math.min(60, Math.max(1, diasEntre(primeraVenta > desde60 ? primeraVenta : desde60, hoy))) : 60;
  const productos = Object.values(prod).map(P => ({
    ...P, stock: P.stock ?? 0, valorStock: (P.stock || 0) * (P.costoUnit || 0),
    dias: P.u60 > 0 && P.stock != null ? Math.round(P.stock / (P.u60 / diasRitmo)) : null,
  })).sort((a, b) => b.ventas - a.ventas || b.stock - a.stock);

  // Cobranza: facturas con saldo.
  const deudas = fact.map(f => ({ ...f, saldo: Math.round((f.total - (cobrado[f.id] || 0)) * 100) / 100, dias: diasEntre(f.fecha, hoy) }))
    .filter(f => f.saldo > 1).sort((a, b) => a.fecha.localeCompare(b.fecha));

  // Clientes con lo que compraron y lo que deben.
  const porComercio = {};
  for (const f of fact) {
    if (!f.comercio_id) continue;
    const X = porComercio[f.comercio_id] ||= { total: 0 };
    X.total += f.total;
  }
  const debe = {};
  for (const d of deudas) if (d.comercio_id) debe[d.comercio_id] = (debe[d.comercio_id] || 0) + d.saldo;
  const clientes = lista.map(c => ({ ...c, total: porComercio[c.id]?.total || 0, debe: debe[c.id] || 0,
    dias_sin_comprar: c.ultima_compra ? diasEntre(c.ultima_compra, hoy) : null }));

  // Pepa: últimas 8 semanas, embudo, motivos y los contactos con foto.
  const [ultimas, tareas, { rows: motivos }, { rows: contactos }, { rows: conContacto }] = await Promise.all([
    semanas(sumarDias(lunes(hoy), -7 * 7), 8),
    tareasAbiertas(),
    pool.query(`
      SELECT motivo, COUNT(*)::int AS n FROM senzen_contactos WHERE resultado = 'no_compro' AND motivo IS NOT NULL
      GROUP BY motivo ORDER BY n DESC`),
    pool.query(`
      SELECT k.id, to_char(k.fecha,'YYYY-MM-DD') AS fecha, k.medio, k.resultado, k.motivo, to_char(k.volver_el,'YYYY-MM-DD') AS volver_el,
             k.lat::float, k.lng::float, (k.foto_key IS NOT NULL) AS foto, c.id AS comercio_id, c.nombre, c.localidad, u.nombre AS quien
      FROM senzen_contactos k JOIN senzen_comercios c ON c.id = k.comercio_id JOIN usuarios u ON u.id = k.usuario_id
      ORDER BY k.creado_en DESC LIMIT 60`),
    pool.query('SELECT DISTINCT comercio_id FROM senzen_contactos'),
  ]);
  const contactados = new Set(conContacto.map(r => r.comercio_id));
  const embudo = {
    comercios: lista.filter(c => c.activo).length,
    contactados: lista.filter(c => c.activo && contactados.has(c.id)).length,
    compraron: lista.filter(c => c.activo && c.compras > 0).length,
    repiten: lista.filter(c => c.activo && c.compras > 1).length,
  };

  return {
    hoy, sync: sync || null, metas: m, meses: mesesOut, productos, deudas, pedidos, clientes,
    pepa: { semanas: ultimas, motivos, contactos, embudo, tareas },
  };
}

module.exports = { generarTareas, registrarContacto, encargar, tareasAbiertas, comercios, miSemana, datos, semana, semanas, lunes, sumarDias, metas };
