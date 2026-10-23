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
// Es el reporte de esa tarea: queda esperando que un dueño lo apruebe (23/10/2026).
// c.comercio (opcional): los datos de un comercio nuevo, que se crea en la misma visita.
async function registrarContacto(c, usuarioId) {
  const cli = await pool.connect();
  try {
    await cli.query('BEGIN');
    if (c.comercio) {
      const { rows: [n] } = await cli.query(`
        INSERT INTO senzen_comercios (nombre, tipo, localidad, direccion, contacto, telefono, creado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [c.comercio.nombre, c.comercio.tipo || null, c.comercio.localidad, c.comercio.direccion, c.comercio.contacto, c.comercio.telefono, usuarioId]);
      c.comercio_id = n.id;
    }
    const { rows: [k] } = await cli.query(`
      INSERT INTO senzen_contactos (comercio_id, usuario_id, fecha, medio, resultado, motivo, volver_el, lat, lng, foto_key, foto_mime, tipo, comentario)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [c.comercio_id, usuarioId, hoyStr(), c.medio, c.resultado, c.motivo || null, c.volver_el || null,
       c.lat ?? null, c.lng ?? null, c.foto_key || null, c.foto_mime || null, c.tipo || 'seguimiento', c.comentario || null]);
    const { rows: cerradas } = await cli.query(`
      UPDATE senzen_tareas SET estado = 'hecha', contacto_id = $2, cerrada_en = NOW()
      WHERE comercio_id = $1 AND estado = 'pendiente' RETURNING id`, [c.comercio_id, k.id]);
    if (cerradas.length) await cli.query('UPDATE senzen_contactos SET tarea_id = $2 WHERE id = $1', [k.id, cerradas[0].id]);
    if (c.volver_el) {
      await cli.query(`INSERT INTO senzen_tareas (comercio_id, tipo, vence, creada_por) VALUES ($1,$2,$3,$4)`,
        [c.comercio_id, c.resultado === 'va_a_comprar' ? 'va_a_comprar' : 'volver', c.volver_el, usuarioId]);
    }
    await cli.query('COMMIT');
    return { id: k.id, comercio_id: c.comercio_id };
  } catch (err) {
    await cli.query('ROLLBACK');
    throw err;
  } finally {
    cli.release();
  }
}

// Encargo de un dueño. Si ya había algo pendiente con ese comercio, se adelanta la fecha.
async function encargar(comercioId, vence, usuarioId, nota = null) {
  await pool.query(`
    INSERT INTO senzen_tareas (comercio_id, tipo, vence, creada_por, nota) VALUES ($1,'visitar',$2,$3,$4)
    ON CONFLICT (comercio_id) WHERE estado = 'pendiente'
    DO UPDATE SET vence = LEAST(senzen_tareas.vence, EXCLUDED.vence), tipo = 'visitar', creada_por = EXCLUDED.creada_por,
                  nota = COALESCE(EXCLUDED.nota, senzen_tareas.nota)`,
    [comercioId, vence, usuarioId, nota]);
}

async function tareasAbiertas() {
  const { rows } = await pool.query(`
    SELECT t.id, t.tipo, to_char(t.vence,'YYYY-MM-DD') AS vence, t.comercio_id, t.nota,
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

// Lo cobrado de cada factura, por las imputaciones de los cobros de Dux.
async function cobradoPorFactura() {
  const { rows } = await pool.query('SELECT imputaciones FROM senzen_cobros');
  const cobrado = {};
  for (const c of rows) for (const i of c.imputaciones) cobrado[i.id_comp_venta] = (cobrado[i.id_comp_venta] || 0) + i.monto;
  return cobrado;
}

// La plata de cada comercio, para la lista (solo dueños): cuánto compró, cuánto debe y su
// último pedido (el más nuevo entre los pedidos y las facturas de Dux).
async function plataPorComercio() {
  const [{ rows: fs }, { rows: ps }, cobrado] = await Promise.all([
    pool.query(`SELECT c.id, f.id_comp_venta::text AS fid, to_char(f.fecha,'YYYY-MM-DD') AS fecha, f.total::float
                FROM senzen_facturas f JOIN senzen_comercios c ON c.dux_id_cliente = f.id_cliente WHERE NOT f.anulada`),
    pool.query(`SELECT c.id, to_char(p.fecha,'YYYY-MM-DD') AS fecha, p.total::float, p.estado
                FROM senzen_pedidos p JOIN senzen_comercios c ON c.dux_id_cliente = p.id_cliente WHERE NOT p.anulado`),
    cobradoPorFactura(),
  ]);
  const out = {};
  const de = id => (out[id] ||= { total: 0, debe: 0, ultimo_pedido: null, ultimo_pedido_total: null, pendiente: 0 });
  for (const f of fs) {
    const X = de(f.id);
    X.total += f.total;
    const saldo = f.total - (cobrado[f.fid] || 0);
    if (saldo > 1) X.debe += saldo;
    if (!X.ultimo_pedido || f.fecha > X.ultimo_pedido) { X.ultimo_pedido = f.fecha; X.ultimo_pedido_total = f.total; }
  }
  for (const p of ps) {
    const X = de(p.id);
    if (p.estado !== 'FACTURADO') X.pendiente += p.total;
    if (!X.ultimo_pedido || p.fecha > X.ultimo_pedido) { X.ultimo_pedido = p.fecha; X.ultimo_pedido_total = p.total; }
  }
  for (const X of Object.values(out)) { X.total = Math.round(X.total * 100) / 100; X.debe = Math.round(X.debe * 100) / 100; }
  return out;
}

// Todo de un comercio, para el detalle. conPlata: los montos son solo para los dueños.
async function comercioDetalle(id, conPlata) {
  const { rows: [c] } = await pool.query(`
    SELECT c.*, to_char(c.creado_en AT TIME ZONE 'America/Argentina/Mendoza','YYYY-MM-DD') AS creado, u.nombre AS creado_por_nombre
    FROM senzen_comercios c LEFT JOIN usuarios u ON u.id = c.creado_por WHERE c.id = $1`, [id]);
  if (!c) return null;
  const [{ rows: facturas }, { rows: pedidos }, { rows: items }, { rows: contactos }, { rows: [tarea] }, cobrado] = await Promise.all([
    pool.query(`SELECT id_comp_venta::text AS id, to_char(fecha,'YYYY-MM-DD') AS fecha, comprobante, total::float
                FROM senzen_facturas WHERE id_cliente = $1 AND NOT anulada ORDER BY fecha DESC`, [c.dux_id_cliente || 0]),
    pool.query(`SELECT nro_pedido, to_char(fecha,'YYYY-MM-DD') AS fecha, total::float, estado
                FROM senzen_pedidos WHERE id_cliente = $1 AND NOT anulado ORDER BY fecha DESC`, [c.dux_id_cliente || 0]),
    pool.query(`SELECT i.item, SUM(i.cantidad)::float AS unidades, SUM(i.subtotal)::float AS total, COUNT(DISTINCT i.id_comp_venta)::int AS veces
                FROM senzen_factura_items i JOIN senzen_facturas f USING (id_comp_venta)
                WHERE f.id_cliente = $1 AND NOT f.anulada GROUP BY i.item ORDER BY SUM(i.subtotal) DESC`, [c.dux_id_cliente || 0]),
    pool.query(`${SELECT_CONTACTO} WHERE k.comercio_id = $1 ORDER BY k.creado_en DESC`, [id]),
    pool.query(`SELECT t.tipo, to_char(t.vence,'YYYY-MM-DD') AS vence, t.nota, u.nombre AS encargada_por
                FROM senzen_tareas t LEFT JOIN usuarios u ON u.id = t.creada_por WHERE t.comercio_id = $1 AND t.estado = 'pendiente'`, [id]),
    conPlata ? cobradoPorFactura() : {},
  ]);
  const base = {
    comercio: { id: c.id, nombre: c.nombre, tipo: c.tipo, localidad: c.localidad, direccion: c.direccion, contacto: c.contacto,
                telefono: c.telefono, consignacion: c.consignacion, activo: c.activo, creado: c.creado,
                creado_por: c.creado_por_nombre, en_dux: !!c.dux_id_cliente },
    proxima: tarea || null,
    contactos: contactos.map(k => ({ id: k.id, fecha: k.fecha, tipo: k.tipo, medio: k.medio, resultado: k.resultado, comentario: k.comentario,
                                     volver_el: k.volver_el, aprobacion: k.aprobacion, respuesta: k.respuesta, foto: k.foto, quien: k.quien })),
    compras: facturas.length,
    primera_compra: facturas.length ? facturas[facturas.length - 1].fecha : null,
    ultima_compra: facturas[0]?.fecha || null,
  };
  if (!conPlata) {
    // Pepa ve qué compra y cuándo, sin montos.
    return { ...base, productos: items.map(i => ({ item: i.item, unidades: i.unidades, veces: i.veces })),
             pedidos: pedidos.map(p => ({ fecha: p.fecha, estado: p.estado })) };
  }
  const fact = facturas.map(f => ({ ...f, saldo: Math.max(0, Math.round((f.total - (cobrado[f.id] || 0)) * 100) / 100) }));
  return {
    ...base, facturas: fact, pedidos, productos: items,
    total: fact.reduce((a, f) => a + f.total, 0), debe: fact.reduce((a, f) => a + (f.saldo > 1 ? f.saldo : 0), 0),
    pendiente: pedidos.filter(p => p.estado !== 'FACTURADO').reduce((a, p) => a + p.total, 0),
  };
}

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

// Cuántos comercios nuevos tiene que visitar en la semana del lunes `desde`: lo que
// pusieron los dueños para esa semana o, si no, la meta general.
async function metaNuevos(desde) {
  return (await planSemana(desde)).meta;
}

// El plan de comercios nuevos de una semana: el total y cuántos le tocan cada día (lunes a
// domingo). por_dia null: los dueños pusieron solo el total, sin repartir.
async function planSemana(desde) {
  const { rows: [r] } = await pool.query('SELECT meta_nuevos, modo, por_dia FROM senzen_semanas WHERE desde = $1', [desde]);
  if (r) return { meta: r.meta_nuevos, modo: r.modo, por_dia: r.por_dia };
  return { meta: (await metas()).nuevos, modo: 'semana', por_dia: null };
}

const SELECT_CONTACTO = `
  SELECT k.id, k.tipo, to_char(k.fecha,'YYYY-MM-DD') AS fecha, k.medio, k.resultado, k.motivo, k.comentario,
         to_char(k.volver_el,'YYYY-MM-DD') AS volver_el, (k.foto_key IS NOT NULL) AS foto, k.aprobacion, k.respuesta,
         k.tarea_id, k.usuario_id, u.nombre AS quien, ua.nombre AS aprobado_por_nombre,
         c.id AS comercio_id, c.nombre, c.localidad, c.direccion, c.contacto, c.telefono, c.tipo AS tipo_comercio
  FROM senzen_contactos k JOIN senzen_comercios c ON c.id = k.comercio_id JOIN usuarios u ON u.id = k.usuario_id
  LEFT JOIN usuarios ua ON ua.id = k.aprobado_por`;

// Las tareas de contactar de una semana: lo pendiente (también lo atrasado y lo que viene)
// y lo que se cerró con un reporte, con en qué quedó ese reporte.
// estado: pend (para hacer) · esp (espera a un dueño) · ok (aprobado) · dev (le pidieron más)
async function tareasDeLaSemana(desde) {
  const hasta = sumarDias(desde, 6);
  const [abiertas, { rows: cerradas }, { rows: montos }] = await Promise.all([
    tareasAbiertas(),
    pool.query(`
      SELECT t.id, t.tipo, to_char(t.vence,'YYYY-MM-DD') AS vence, t.comercio_id, t.nota,
             c.nombre, c.localidad, c.telefono, u.nombre AS encargada_por, u.rol AS rol_encargo,
             k.id AS k_id, k.medio, k.resultado, k.comentario, k.aprobacion, k.respuesta, to_char(k.volver_el,'YYYY-MM-DD') AS volver_el,
             (k.foto_key IS NOT NULL) AS foto, to_char(k.fecha,'YYYY-MM-DD') AS fecha_contacto
      FROM senzen_tareas t JOIN senzen_comercios c ON c.id = t.comercio_id
      JOIN senzen_contactos k ON k.id = t.contacto_id
      LEFT JOIN usuarios u ON u.id = t.creada_por
      WHERE t.estado = 'hecha' AND (t.vence BETWEEN $1 AND $2 OR k.fecha BETWEEN $1 AND $2 OR k.aprobacion = 'devuelto')`, [desde, hasta]),
    pool.query(`
      SELECT DISTINCT ON (c.id) c.id, f.total::float AS total FROM senzen_comercios c
      JOIN senzen_facturas f ON f.id_cliente = c.dux_id_cliente AND NOT f.anulada ORDER BY c.id, f.fecha DESC`),
  ]);
  const C = await compras();
  const monto = Object.fromEntries(montos.map(m => [m.id, m.total]));
  const base = t => ({
    id: t.id, tipo: t.tipo, vence: t.vence, comercio_id: t.comercio_id, nombre: t.nombre, localidad: t.localidad, telefono: t.telefono,
    nota: t.nota, encargada_por: t.rol_encargo === 'admin' ? t.encargada_por : null,
    ultima_compra: C[t.comercio_id]?.ultima || null, ultimo_monto: monto[t.comercio_id] ?? null,
  });
  return [
    ...abiertas.map(t => ({ ...base(t), estado: 'pend', contacto: null })),
    ...cerradas.map(t => ({
      ...base(t),
      estado: t.aprobacion === 'aprobado' ? 'ok' : t.aprobacion === 'devuelto' ? 'dev' : 'esp',
      contacto: { id: t.k_id, fecha: t.fecha_contacto, medio: t.medio, resultado: t.resultado, comentario: t.comentario,
                  respuesta: t.respuesta, volver_el: t.volver_el, foto: t.foto },
    })),
  ].sort((a, b) => a.vence.localeCompare(b.vence) || a.nombre.localeCompare(b.nombre));
}

// Las visitas a comercios nuevos de la semana (y las devueltas de antes, que hay que corregir).
async function nuevosDeLaSemana(desde) {
  const { rows } = await pool.query(`${SELECT_CONTACTO}
    WHERE k.tipo = 'nuevo' AND (k.fecha BETWEEN $1 AND $2 OR k.aprobacion = 'devuelto') ORDER BY k.creado_en`, [desde, sumarDias(desde, 6)]);
  return rows;
}

// Lo que ve Pepa: su semana como calendario de tareas, sin plata.
async function miSemana() {
  const hoy = hoyStr(), desde = lunes(hoy);
  const [s, tareas, nuevos, plan, m] = await Promise.all([semana(desde), tareasDeLaSemana(desde), nuevosDeLaSemana(desde), planSemana(desde), metas()]);
  const { ventas, ...sinPlata } = s;
  return { hoy, desde, hasta: sumarDias(desde, 6), semana: sinPlata, metas: { contactos: m.contactos, nuevos: plan.meta }, meta_nuevos: plan.meta, plan, tareas, nuevos };
}

// Lo que ven los dueños: qué aprobar, el plan de la semana y cómo va.
async function semanaDuenos() {
  const hoy = hoyStr(), desde = lunes(hoy);
  const [{ rows: paraAprobar }, tareas, nuevos, plan, planProxima, lista] = await Promise.all([
    pool.query(`${SELECT_CONTACTO} WHERE k.aprobacion = 'pendiente' ORDER BY k.creado_en`),
    tareasDeLaSemana(desde), nuevosDeLaSemana(desde), planSemana(desde), planSemana(sumarDias(desde, 7)), comercios(),
  ]);
  const meta = plan.meta, metaProxima = planProxima.meta;
  const { rows: tareasDe } = await pool.query(`SELECT t.id, t.tipo, t.nota, u.nombre AS encargada_por FROM senzen_tareas t LEFT JOIN usuarios u ON u.id = t.creada_por WHERE t.id = ANY($1)`,
    [paraAprobar.map(k => k.tarea_id).filter(Boolean)]);
  const tarea = Object.fromEntries(tareasDe.map(t => [t.id, t]));
  return {
    hoy, desde, hasta: sumarDias(desde, 6), meta_nuevos: meta, meta_proxima: metaProxima, plan, plan_proxima: planProxima,
    para_aprobar: paraAprobar.map(k => ({ ...k, tarea: k.tarea_id ? tarea[k.tarea_id] || null : null })),
    tareas, nuevos,
    comercios: lista.filter(c => c.activo).map(c => ({ id: c.id, nombre: c.nombre, localidad: c.localidad, compras: c.compras, proxima: c.proxima })),
  };
}

async function contacto(id) {
  return (await pool.query(`${SELECT_CONTACTO} WHERE k.id = $1`, [id])).rows[0] || null;
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
      SELECT motivo, COUNT(*)::int AS n FROM senzen_contactos WHERE resultado IN ('no_compro', 'no_quiere') AND motivo IS NOT NULL
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

module.exports = { plataPorComercio, comercioDetalle, planSemana, generarTareas, registrarContacto, encargar, tareasAbiertas, comercios, miSemana, semanaDuenos, contacto, metaNuevos, datos, semana, semanas, lunes, sumarDias, metas };
