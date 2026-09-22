const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRol, ROLES } = require('../middleware/auth');
const { hoyStr } = require('../utils/fechas');
const { unoPorTurno, esNovedad } = require('../utils/reportes');
const { valorMantenimiento, itemsDelDia } = require('../utils/mantenimiento');
const { nombresDeProductos, items: itemsVencimiento, paraCierre } = require('../utils/vencimientos');
const { localCafeteria, teoricoCafe, cafeDelDia } = require('../utils/cafe');

const router = express.Router();


const n = v => Number(v) || 0;

// Las horas de un reporte según el tipo de plantilla: la de café trae las de todo
// el turno, las otras solo las de quien firma.
// Filas de detalle sin nada cargado (la vacía que deja el formulario al tocar "Sí").
function filasConDatos(items) {
  return (Array.isArray(items) ? items : []).filter(
    f => f && Object.values(f).some(x => x !== undefined && x !== null && String(x).trim() !== '')
  );
}

function horasDe(reporte) {
  const r = reporte.respuestas || {};
  if (Array.isArray(r.horas_equipo)) {
    return r.horas_equipo
      .filter(f => f.empleado_id && Number(f.horas) > 0)
      .map(f => ({ empleado_id: Number(f.empleado_id), horas: Number(f.horas) }));
  }
  if (r.horas && Number(r.horas) > 0 && reporte.empleado_id) {
    return [{ empleado_id: reporte.empleado_id, horas: Number(r.horas) }];
  }
  return [];
}

// Las facturas de proveedores que le tienen que llegar al dueño con el cierre: lo que
// se pagó ese día, lo que ya venció y lo que vence antes del domingo. Se arma solo:
// el encargado no transcribe nada de esto.
async function facturasDelDia(fecha) {
  // Las facturas que entraron ese día, cargadas desde el reporte del turno o desde Proveedores.
  const cargadas = (await pool.query(`
    SELECT f.numero, f.total, f.vencimiento::text AS vencimiento,
           COALESCE(p.nombre, f.proveedor) AS proveedor,
           l.nombre AS local_nombre
    FROM facturas f
    LEFT JOIN proveedores p ON p.id = f.proveedor_id
    LEFT JOIN locales     l ON l.id = f.local_id
    WHERE f.fecha = $1
    ORDER BY f.id
  `, [fecha])).rows.map(r => ({ ...r, total: n(r.total) }));

  const pagos = (await pool.query(`
    SELECT pg.monto, pg.medio, pg.comprobante,
           f.numero AS factura_numero,
           COALESCE(p.nombre, f.proveedor) AS proveedor
    FROM pagos_proveedor pg
    JOIN facturas f ON f.id = pg.factura_id
    LEFT JOIN proveedores p ON p.id = f.proveedor_id
    WHERE pg.fecha = $1
    ORDER BY pg.id
  `, [fecha])).rows;

  // El domingo de esa semana: hasta ahí llega "vence esta semana".
  const d = new Date(`${fecha}T00:00:00`);
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  const finSemana = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const abiertas = (await pool.query(`
    SELECT f.numero, f.vencimiento::text AS vencimiento, f.local_id,
           COALESCE(p.nombre, f.proveedor) AS proveedor,
           p.medio_pago,
           l.nombre AS local_nombre,
           f.total - COALESCE((SELECT SUM(monto) FROM pagos_proveedor WHERE factura_id = f.id), 0) AS saldo
    FROM facturas f
    LEFT JOIN proveedores p ON p.id = f.proveedor_id
    LEFT JOIN locales     l ON l.id = f.local_id
    WHERE f.total - COALESCE((SELECT SUM(monto) FROM pagos_proveedor WHERE factura_id = f.id), 0) > 0
    ORDER BY f.vencimiento, f.id
  `)).rows.map(r => ({ ...r, saldo: n(r.saldo) }));

  const vencidas = abiertas.filter(f => f.vencimiento && f.vencimiento < fecha);
  const semana   = abiertas.filter(f => f.vencimiento && f.vencimiento >= fecha && f.vencimiento <= finSemana);

  const sumar = lista => lista.reduce((s, f) => s + f.saldo, 0);

  return {
    cargadas,
    total_cargadas: cargadas.reduce((s, f) => s + f.total, 0),
    pagos,
    pagado_hoy: pagos.reduce((s, p) => s + n(p.monto), 0),
    vencidas,
    total_vencido: sumar(vencidas),
    semana,
    total_semana: sumar(semana),
    fin_semana: finSemana,
    deuda_total: sumar(abiertas),
    facturas_abiertas: abiertas.length,
  };
}

// Arma el consolidado del día: lo que ya sabe el sistema más lo que cargó cada turno.
// El encargado no transcribe nada de esto — lo verifica.
async function armarDia(fecha) {
  const locales = (await pool.query(
    'SELECT id, nombre, tipo, objetivo_horas_ventas FROM locales WHERE activo = true ORDER BY id'
  )).rows;

  // Ventas y tickets del Excel de Fudo ya importado.
  const ventas = (await pool.query(`
    SELECT local_id, COALESCE(SUM(total), 0) AS total, COUNT(*)::int AS tickets
    FROM ventas_tickets
    WHERE fecha = $1 AND estado = 'cerrada'
    GROUP BY local_id
  `, [fecha])).rows;
  const ventasPorLocal = Object.fromEntries(
    ventas.map(v => [v.local_id, { total: n(v.total), tickets: v.tickets }])
  );

  // Reportes de turno del día.
  // Si dos personas enviaron el mismo turno, cuenta uno solo (la misma regla que la
  // grilla del día): si no, las ventas de ese turno se suman dos veces.
  const reportes = unoPorTurno((await pool.query(`
    SELECT r.id, r.local_id, r.turno, r.estado, r.empleado_id, r.respuestas,
           r.plantilla_codigo, r.enviado_at, u.nombre AS usuario_nombre
    FROM reportes r
    JOIN usuarios u ON u.id = r.usuario_id
    WHERE r.fecha = $1 AND r.estado <> 'borrador'
    ORDER BY r.local_id, r.turno
  `, [fecha])).rows);

  // Valor hora vigente a esa fecha, por persona.
  const valores = (await pool.query(`
    SELECT DISTINCT ON (empleado_id) empleado_id, valor_hora
    FROM valor_hora_empleado
    WHERE vigente_desde <= $1
    ORDER BY empleado_id, vigente_desde DESC
  `, [fecha])).rows;
  const valorDe = Object.fromEntries(valores.map(v => [v.empleado_id, n(v.valor_hora)]));

  const empleados = Object.fromEntries(
    (await pool.query('SELECT id, nombre, puesto, local_id_principal FROM empleados')).rows
      .map(e => [e.id, e])
  );

  // Acumular horas, gasto y personas atendidas por local.
  const porLocal = {};
  for (const l of locales) {
    porLocal[l.id] = {
      local_id: l.id, nombre: l.nombre, tipo: l.tipo,
      ventas_sistema: ventasPorLocal[l.id]?.total ?? 0,
      tickets_sistema: ventasPorLocal[l.id]?.tickets ?? 0,
      objetivo: n(l.objetivo_horas_ventas),
      personas_reportadas: 0,
      ventas_reportadas: 0,
      horas: 0, gasto_personal: 0,
      horas_sin_valor: 0,
      reportes: [], turnos_con_reporte: [],
    };
  }

  const novedades = { vencimientos: [], mantenimiento: [], faltantes: [], ausencias: [], quejas: [], gastos: [] };
  // El maestro de productos, para ponerle nombre a lo que el check guardó como id.
  const nombresProducto = await nombresDeProductos();
  const horasPorPersona = new Map();
  const dichoHoy = [];   // { id, turno, respuesta } por cada ítem de mantenimiento que nombró un turno

  for (const rep of reportes) {
    const acc = porLocal[rep.local_id];
    if (!acc) continue;

    acc.reportes.push({
      id: rep.id, turno: rep.turno, estado: rep.estado,
      usuario_nombre: rep.usuario_nombre, plantilla: rep.plantilla_codigo,
    });
    acc.turnos_con_reporte.push(rep.turno);

    const r = rep.respuestas || {};
    acc.personas_reportadas += n(r.personas);
    acc.ventas_reportadas   += n(r.ventas);

    // Las horas se juntan por persona y turno, no por reporte: la cocinera aparece en
    // el equipo del café Y en su propio reporte de cocina, y son las mismas horas.
    for (const fila of horasDe(rep)) {
      const clave = `${rep.local_id}|${rep.turno}|${fila.empleado_id}`;
      const previa = horasPorPersona.get(clave);
      if (!previa || fila.horas > previa.horas) {
        horasPorPersona.set(clave, { acc, empleado_id: fila.empleado_id, horas: fila.horas });
      }
    }

    // Novedades que el encargado tiene que mirar y resumir para los dueños.
    const local = porLocal[rep.local_id].nombre;
    const quien = rep.usuario_nombre;
    // Los días que faltan se calculan acá, contra la fecha del cierre: el reporte
    // guarda la fecha del paquete y nada más, así que un cierre viejo sigue diciendo
    // los días que faltaban ese día.
    if (r.vencimientos?.hubo) {
      for (const it of itemsVencimiento(r.vencimientos)) {
        const fila = paraCierre(it, fecha, nombresProducto);
        if (!fila.producto) continue;
        novedades.vencimientos.push({ local, turno: rep.turno, quien, ...fila });
      }
    }
    // Mantenimiento: lo que dijo el turno sobre cada ítem (nuevo, sigue igual, se
    // solucionó). Los reportes anteriores al seguimiento traen un texto suelto.
    const m = valorMantenimiento(r.mantenimiento);
    if (m.legado) {
      novedades.mantenimiento.push({ id: null, local, local_id: rep.local_id, turno: rep.turno, quien, texto: m.legado, legado: true, hoy: [] });
    }
    for (const [id, resp] of Object.entries(m.seguimiento)) {
      dichoHoy.push({ id: Number(id), turno: rep.turno, quien, respuesta: resp });
    }
    for (const nuevo of m.nuevos) {
      if (nuevo.item_id) dichoHoy.push({ id: nuevo.item_id, turno: rep.turno, quien, respuesta: 'nuevo' });
    }
    if (r.faltantes?.hubo) {
      for (const it of filasConDatos(r.faltantes.items)) {
        novedades.faltantes.push({ local, turno: rep.turno, quien, ...it });
      }
    }
    if (r.ausencias?.hubo) {
      for (const it of filasConDatos(r.ausencias.items)) {
        novedades.ausencias.push({ local, turno: rep.turno, quien, ...it });
      }
    }
    if (esNovedad(r.quejas)) {
      novedades.quejas.push({ local, turno: rep.turno, quien, texto: r.quejas.trim() });
    }
    // Plata que salió de la caja del turno: pagos a proveedores, compras de insumos.
    if (r.gastos?.hubo) {
      for (const it of filasConDatos(r.gastos.items)) {
        novedades.gastos.push({ local, turno: rep.turno, quien, ...it, monto: n(it.monto) });
      }
    }
  }
  novedades.total_gastos = novedades.gastos.reduce((s, g) => s + g.monto, 0);

  // Los ítems de mantenimiento tal como estaban ese día, con lo que dijo cada turno.
  // Primero lo nuevo de hoy, después lo que sigue arrastrándose, al final lo resuelto.
  const diasEntre = (desde, hasta) => Math.round((Date.parse(`${hasta}T12:00:00`) - Date.parse(`${desde}T12:00:00`)) / 86400000);
  for (const it of await itemsDelDia(fecha)) {
    if (!porLocal[it.local_id]) continue;
    const resueltoHoy = it.resuelto_fecha === fecha;
    novedades.mantenimiento.push({
      id: it.id, local: porLocal[it.local_id].nombre, local_id: it.local_id,
      texto: it.texto, rubro: it.rubro || '', fecha: it.fecha, reportado_por: it.reportado_por,
      dias: diasEntre(it.fecha, fecha),
      estado: resueltoHoy ? 'resuelto' : 'abierto',
      plan: it.plan || '',
      hoy: dichoHoy.filter(d => d.id === it.id).map(({ turno, respuesta }) => ({ turno, respuesta })),
      // El turno de hoy que lo informó, para mostrarlo como el resto de las novedades.
      turno: dichoHoy.find(d => d.id === it.id)?.turno || '',
      quien: dichoHoy.find(d => d.id === it.id)?.quien || it.reportado_por || '',
    });
  }
  const orden = it => it.legado ? 3 : it.estado === 'resuelto' ? 2 : it.fecha === fecha ? 0 : 1;
  novedades.mantenimiento.sort((a, b) => a.local_id - b.local_id || orden(a) - orden(b) || (a.id || 0) - (b.id || 0));

  for (const { acc, empleado_id, horas } of horasPorPersona.values()) {
    const valor = valorDe[empleado_id];
    acc.horas += horas;
    if (valor) acc.gasto_personal += horas * valor;
    else acc.horas_sin_valor += horas;
  }

  const guardado = (await pool.query('SELECT * FROM consolidados WHERE fecha = $1', [fecha])).rows[0] || null;

  // Cuántos reportes de venta se esperan en cada local. Solo cuentan las plantillas
  // que piden ventas (cocina no las pide), y solo si el local tiene gente de esa área
  // cargando reportes.
  //
  // Es una aproximación: cuenta todos los turnos de la plantilla, sin saber quién
  // trabajó hoy. La cuenta exacta va a salir de la grilla de turnos.
  const plantillas = (await pool.query(
    'SELECT codigo, area, campos FROM reporte_plantillas WHERE activo = true'
  )).rows;
  const areasQueReportan = (await pool.query(`
    SELECT DISTINCT local_id_principal AS local_id, area
    FROM empleados WHERE activo = true AND carga_reporte = true
  `)).rows;

  const esperadosPorLocal = {};
  for (const { local_id, area } of areasQueReportan) {
    const p = plantillas.find(x => x.area === area);
    if (!p) continue;
    const pideVentas = p.campos.some(c => c.codigo === 'ventas');
    if (!pideVentas) continue;
    const turnos = p.campos.find(c => c.codigo === 'turno')?.opciones || [];
    esperadosPorLocal[local_id] = (esperadosPorLocal[local_id] || 0) + turnos.length;
  }

  // El control real: lo que reportó cada turno a mano contra lo que trajo el Excel
  // de Fudo. Son dos fuentes independientes; si no cierran, algo pasó. Pero solo
  // vale comparar cuando están todos los turnos: si falta uno, la diferencia es
  // el turno que falta, no un error de nadie.
  const filas = Object.values(porLocal).map(l => {
    const esperados = esperadosPorLocal[l.local_id] || 0;
    const conVentas = l.reportes.filter(r => {
      const p = plantillas.find(x => x.codigo === r.plantilla);
      return p?.campos.some(c => c.codigo === 'ventas');
    }).length;
    const completo = esperados > 0 && conVentas >= esperados;

    return {
      ...l,
      turnos_esperados: esperados,
      turnos_reportados: conVentas,
      completo,
      diferencia: completo ? l.ventas_reportadas - l.ventas_sistema : null,
      horas_sobre_ventas: (l.ventas_sistema > 0 && l.gasto_personal > 0)
        ? (l.gasto_personal / l.ventas_sistema) * 100
        : null,
      ticket_promedio: l.tickets_sistema > 0 ? l.ventas_sistema / l.tickets_sistema : null,
    };
  });

  const totales = filas.reduce((t, l) => ({
    ventas_sistema:    t.ventas_sistema + l.ventas_sistema,
    ventas_reportadas: t.ventas_reportadas + l.ventas_reportadas,
    tickets:           t.tickets + l.tickets_sistema,
    personas:          t.personas + (l.personas_reportadas || l.tickets_sistema),
    horas:             t.horas + l.horas,
    gasto_personal:    t.gasto_personal + l.gasto_personal,
    horas_sin_valor:   t.horas_sin_valor + l.horas_sin_valor,
  }), {
    ventas_sistema: 0, ventas_reportadas: 0, tickets: 0, personas: 0,
    horas: 0, gasto_personal: 0, horas_sin_valor: 0,
  });

  // Objetivo de la red: el de cada local pesado por su venta. Un café con objetivo 22 y
  // tiendas con 12 no se pueden comparar contra un número fijo.
  totales.objetivo = totales.ventas_sistema > 0
    ? filas.reduce((s, l) => s + (l.objetivo || 0) * l.ventas_sistema, 0) / totales.ventas_sistema
    : null;

  totales.horas_sobre_ventas = (totales.ventas_sistema > 0 && totales.gasto_personal > 0)
    ? (totales.gasto_personal / totales.ventas_sistema) * 100
    : null;
  totales.ticket_promedio = totales.tickets > 0 ? totales.ventas_sistema / totales.tickets : null;

  // Un ticket de café y uno de tienda no se parecen en nada: el promedio mezclado
  // no le dice nada a nadie. Van separados.
  const promedioDe = grupo => {
    const v = grupo.reduce((s, l) => s + l.ventas_sistema, 0);
    const k = grupo.reduce((s, l) => s + l.tickets_sistema, 0);
    return k > 0 ? v / k : null;
  };
  totales.ticket_promedio_tiendas = promedioDe(filas.filter(l => l.tipo !== 'cafeteria'));
  totales.ticket_promedio_cafe    = promedioDe(filas.filter(l => l.tipo === 'cafeteria'));

  // Café del día: lo que pesó la barista de la mañana al entrar y la de la tarde al
  // terminar, cuánto se consumió, y el control contra lo vendido según el maestro.
  const cafe = cafeDelDia(reportes, plantillas, await teoricoCafe(fecha, await localCafeteria()));

  return {
    fecha, locales: filas, totales, novedades, cafe,
    proveedores: await facturasDelDia(fecha),
    consolidado: guardado,
  };
}


// ── Resumen semanal ───────────────────────────────────────────────────────────
// La semana va de sábado a viernes: cierra con el viernes y arranca con el finde,
// que es lo fuerte. Se arma reusando el consolidado de cada día, así los números
// son exactamente los que ya vio el encargado día por día. Solo informa: no marca
// nada como resuelto ni pide acciones.

const DIA_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function fechaStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return fechaStr(d);
}
function diaCorto(fecha) {
  const d = new Date(`${fecha}T12:00:00`);
  return `${DIA_CORTO[d.getDay()]} ${d.getDate()}`;
}

async function ventasEntre(desde, hasta) {
  const { rows } = await pool.query(`
    SELECT t.local_id, COALESCE(SUM(t.total), 0) AS total, COUNT(*)::int AS tickets,
           COALESCE((SELECT SUM(i.docenas_equivalentes) FROM ventas_items i
                     JOIN ventas_tickets t2 ON t2.id = i.ticket_id
                     WHERE t2.local_id = t.local_id AND t2.fecha BETWEEN $1 AND $2
                       AND t2.estado = 'cerrada' AND NOT i.cancelada), 0) AS docenas
    FROM ventas_tickets t
    WHERE t.fecha BETWEEN $1 AND $2 AND t.estado = 'cerrada'
    GROUP BY t.local_id
  `, [desde, hasta]);
  const porLocal = Object.fromEntries(rows.map(r => [r.local_id, { total: n(r.total), tickets: r.tickets, docenas: n(r.docenas) }]));
  const total = rows.reduce((a, r) => ({ total: a.total + n(r.total), tickets: a.tickets + r.tickets, docenas: a.docenas + n(r.docenas) }), { total: 0, tickets: 0, docenas: 0 });
  return { porLocal, total };
}

async function armarSemana(hasta) {
  const desde = sumarDias(hasta, -6);
  const fechas = Array.from({ length: 7 }, (_, i) => sumarDias(desde, i));

  // Los siete días en paralelo: cada uno son varias consultas a la base, y en serie
  // el resumen tardaba medio minuto.
  const dias = await Promise.all(fechas.map(armarDia));

  const [actual, anterior, anio] = await Promise.all([
    ventasEntre(desde, hasta),
    ventasEntre(sumarDias(desde, -7), sumarDias(hasta, -7)),
    ventasEntre(sumarDias(desde, -364), sumarDias(hasta, -364)),   // mismo día de la semana, un año atrás
  ]);

  // Reportes que llegaron después del día, y los devueltos, por persona.
  const tarde = (await pool.query(`
    SELECT u.nombre AS usuario, l.nombre AS local, r.fecha::text, r.turno
    FROM reportes r JOIN usuarios u ON u.id = r.usuario_id JOIN locales l ON l.id = r.local_id
    WHERE r.fecha BETWEEN $1 AND $2 AND r.enviado_at IS NOT NULL
      AND (r.enviado_at AT TIME ZONE 'America/Argentina/Mendoza')::date > r.fecha
  `, [desde, hasta])).rows;
  const devueltos = (await pool.query(`
    SELECT u.nombre AS usuario, COUNT(*)::int AS veces
    FROM reporte_revisiones rv JOIN reportes r ON r.id = rv.reporte_id JOIN usuarios u ON u.id = r.usuario_id
    WHERE rv.accion = 'observo' AND r.fecha BETWEEN $1 AND $2
    GROUP BY u.nombre ORDER BY veces DESC, u.nombre
  `, [desde, hasta])).rows;

  // Proveedores: lo pagado en la semana y lo que vence en la próxima.
  const pagado = n((await pool.query(
    'SELECT COALESCE(SUM(monto), 0) AS t FROM pagos_proveedor WHERE fecha BETWEEN $1 AND $2', [desde, hasta]
  )).rows[0].t);
  const abiertas = (await pool.query(`
    SELECT f.vencimiento::text AS vencimiento,
           f.total - COALESCE((SELECT SUM(monto) FROM pagos_proveedor WHERE factura_id = f.id), 0) AS saldo
    FROM facturas f
    WHERE f.total - COALESCE((SELECT SUM(monto) FROM pagos_proveedor WHERE factura_id = f.id), 0) > 0
  `)).rows.map(r => ({ ...r, saldo: n(r.saldo) }));
  const proxSemana = abiertas.filter(f => f.vencimiento && f.vencimiento > hasta && f.vencimiento <= sumarDias(hasta, 7));
  const vencidas   = abiertas.filter(f => f.vencimiento && f.vencimiento <= hasta);

  return { desde, hasta, fechas, dias, actual, anterior, anio, tarde, devueltos,
           proveedores: {
             pagado, deuda: abiertas.reduce((s, f) => s + f.saldo, 0), facturas: abiertas.length,
             vence_proxima: proxSemana.reduce((s, f) => s + f.saldo, 0), n_proxima: proxSemana.length,
             vencido: vencidas.reduce((s, f) => s + f.saldo, 0), n_vencidas: vencidas.length,
           } };
}

const money = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const $ = v => `$ ${money.format(v)}`;
const pct = v => v == null ? 's/d' : `${v.toFixed(1)}%`;
const corto = nombre => nombre.replace(' Tienda de Alfajores', '').replace(' Cafetería', '');
const variacion = (ahora, antes) => antes > 0 ? `${ahora >= antes ? '+' : '−'}${Math.abs((ahora / antes - 1) * 100).toFixed(0)}%` : null;

// Los números de la semana a partir de los siete días, para el texto y para el PDF.
function resumenSemana(w) {
  const d0 = new Date(`${w.desde}T12:00:00`), d1 = new Date(`${w.hasta}T12:00:00`);
  const rango = d0.getMonth() === d1.getMonth()
    ? `sáb ${d0.getDate()} al vie ${d1.getDate()} de ${MES_LARGO[d1.getMonth()]}`
    : `sáb ${d0.getDate()} de ${MES_LARGO[d0.getMonth()]} al vie ${d1.getDate()} de ${MES_LARGO[d1.getMonth()]}`;

  const locales = w.dias[0].locales.map(l => l.local_id);
  const nombreDe = Object.fromEntries(w.dias[0].locales.map(l => [l.local_id, l.nombre]));
  const objetivoDe = Object.fromEntries(w.dias[0].locales.map(l => [l.local_id, l.objetivo]));

  // Totales de la semana a partir de los días.
  // El KPI de la semana se calcula solo sobre los días que tienen horas cargadas: si
  // faltan reportes, dividir el gasto de un día por la venta de siete diría cualquier cosa.
  const tot = { horas: 0, gasto: 0, sin_valor: 0, ventas_con_horas: 0, dias_con_ventas: 0 };
  const porLocal = {};
  for (const id of locales) porLocal[id] = { horas: 0, gasto: 0, ventas_con_horas: 0, dias_con_horas: 0, dias_con_ventas: 0, dias_kpi: 0, dias_en_meta: 0, dias_sin_reportes: [], no_cierra: [], mejor: null, peor: null };
  for (const dia of w.dias) {
    tot.horas += dia.totales.horas; tot.gasto += dia.totales.gasto_personal; tot.sin_valor += dia.totales.horas_sin_valor;
    for (const l of dia.locales) {
      const a = porLocal[l.local_id];
      a.horas += l.horas; a.gasto += l.gasto_personal;
      if (l.ventas_sistema > 0) a.dias_con_ventas++;
      if (l.horas > 0 && l.ventas_sistema > 0) { a.ventas_con_horas += l.ventas_sistema; a.dias_con_horas++; tot.ventas_con_horas += l.ventas_sistema; }
      if (l.horas_sobre_ventas != null) { a.dias_kpi++; if (l.horas_sobre_ventas <= l.objetivo) a.dias_en_meta++; }
      if (l.turnos_esperados > 0 && !l.completo) a.dias_sin_reportes.push(diaCorto(dia.fecha));
      if (l.diferencia != null && Math.abs(l.diferencia) >= 1) {
        a.no_cierra.push({ dia: diaCorto(dia.fecha), dif: l.diferencia, exp: dia.consolidado?.explicaciones?.[String(l.local_id)]?.trim() });
      }
      if (l.ventas_sistema > 0) {
        if (!a.mejor || l.ventas_sistema > a.mejor.v) a.mejor = { dia: diaCorto(dia.fecha), v: l.ventas_sistema };
        if (!a.peor  || l.ventas_sistema < a.peor.v)  a.peor  = { dia: diaCorto(dia.fecha), v: l.ventas_sistema };
      }
    }
  }
  const ventaTotal = w.actual.total.total;
  const kpiRed = tot.ventas_con_horas > 0 && tot.gasto > 0 ? tot.gasto / tot.ventas_con_horas * 100 : null;
  const metaRed = ventaTotal > 0
    ? locales.reduce((s, id) => s + (objetivoDe[id] || 0) * (w.actual.porLocal[id]?.total || 0), 0) / ventaTotal : null;
  const diasConHoras = w.dias.filter(d => d.totales.horas > 0).length;
  const diasConVentas = w.dias.filter(d => d.totales.ventas_sistema > 0).length;

  // Novedades acumuladas, contadas.
  const todas = { vencimientos: [], mantenimiento: [], faltantes: [], ausencias: [], quejas: [], gastos: [] };
  for (const dia of w.dias) for (const k of Object.keys(todas)) for (const it of (dia.novedades[k] || [])) todas[k].push({ ...it, dia: diaCorto(dia.fecha) });
  const contar = (items, clave) => {
    const c = {};
    for (const it of items) { const k = clave(it); if (k) c[k] = (c[k] || 0) + 1; }
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  };
  // Un ítem que se arrastra toda la semana aparece una vez, con lo último que se supo.
  const mant = new Map();
  for (const it of todas.mantenimiento) mant.set(it.id || `legado:${it.local}:${it.texto}`, it);
  const abiertos  = [...mant.values()].filter(it => it.estado !== 'resuelto');
  const resueltos = [...mant.values()].filter(it => it.estado === 'resuelto');
  const cerrados = w.dias.filter(d => d.consolidado?.estado === 'cerrado').map(d => diaCorto(d.fecha));
  const sinCerrar = w.dias.filter(d => d.consolidado?.estado !== 'cerrado').map(d => diaCorto(d.fecha));
  let esperados = 0, recibidos = 0;
  for (const dia of w.dias) for (const l of dia.locales) { esperados += l.turnos_esperados; recibidos += Math.min(l.turnos_reportados, l.turnos_esperados); }

  return { rango, locales, nombreDe, objetivoDe, tot, porLocal, ventaTotal, kpiRed, metaRed, diasConHoras, diasConVentas,
           todas, contar, mant, abiertos, resueltos, cerrados, sinCerrar, esperados, recibidos };
}

// El texto para WhatsApp: cuatro renglones, igual que el diario. El detalle va en
// el PDF de la semana.
function textoSemana(w) {
  const { rango, ventaTotal } = resumenSemana(w);
  const tipoDe = Object.fromEntries(w.dias[0].locales.map(l => [l.local_id, l.tipo]));
  const tiendas = Object.entries(w.actual.porLocal).filter(([id]) => tipoDe[id] !== 'cafeteria');
  const vTiendas = tiendas.reduce((s, [, v]) => s + v.total, 0);
  const kTiendas = tiendas.reduce((s, [, v]) => s + v.tickets, 0);
  const cafe = Object.entries(w.actual.porLocal).find(([id]) => tipoDe[id] === 'cafeteria');
  const personasCafe = w.dias.reduce((s, d) => s + d.locales.filter(l => l.tipo === 'cafeteria').reduce((t, l) => t + (l.personas_reportadas || 0), 0), 0);

  const L = [];
  L.push(`*Resumen semanal · ${rango}*`);
  const va = variacion(ventaTotal, w.anterior.total.total);
  L.push(`Ventas ${$(ventaTotal)}${va ? ` (${va} vs. semana anterior)` : ''}`);
  L.push(`Ticket promedio tiendas ${kTiendas ? $(vTiendas / kTiendas) : 's/d'}`);
  if (cafe && cafe[1].total) {
    L.push(personasCafe
      ? `Café: ${$(cafe[1].total / personasCafe)} por persona atendida (${money.format(personasCafe)} personas)`
      : `Café: ${cafe[1].tickets ? $(cafe[1].total / cafe[1].tickets) : 's/d'} por ticket`);
  }
  return L.join('\n');
}

// ── GET /semana/pdf ───────────────────────────────────────────────────────────
router.get('/semana/pdf', requireAuth, requireRol(ROLES.ENCARGADO_GENERAL), async (req, res) => {
  try {
    const hasta = req.query.hasta || hoyStr();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return res.status(400).json({ ok: false, error: 'Fecha inválida' });
    const w = await armarSemana(hasta);
    const { pdfSemana } = require('../services/pdfCierre');
    const buffer = await pdfSemana(w, resumenSemana(w));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Semana ${w.desde} a ${w.hasta}.pdf"`);
    res.send(buffer);
  } catch (err) {
    console.error('[consolidado/semana/pdf]', err);
    res.status(500).json({ ok: false, error: 'No se pudo armar el PDF de la semana' });
  }
});

// ── GET /semana ───────────────────────────────────────────────────────────────
// La semana que termina en `hasta` (un viernes, normalmente). Devuelve el texto listo
// para WhatsApp; el detalle día por día ya está en cada consolidado.

router.get('/semana', requireAuth, requireRol(ROLES.ENCARGADO_GENERAL), async (req, res) => {
  try {
    const hasta = req.query.hasta || hoyStr();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return res.status(400).json({ ok: false, error: 'Fecha inválida' });
    const w = await armarSemana(hasta);
    res.json({ ok: true, data: { desde: w.desde, hasta: w.hasta, texto: textoSemana(w) } });
  } catch (err) {
    console.error('[consolidado/semana]', err);
    res.status(500).json({ ok: false, error: 'Error al armar el resumen semanal' });
  }
});

// ── GET / ─────────────────────────────────────────────────────────────────────
// El dueño también entra: requireRol deja pasar admin siempre.

router.get('/', requireAuth, requireRol(ROLES.ENCARGADO_GENERAL), async (req, res) => {
  try {
    const fecha = req.query.fecha || hoyStr();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return res.status(400).json({ ok: false, error: 'Fecha inválida' });
    }
    res.json({ ok: true, data: await armarDia(fecha) });
  } catch (err) {
    console.error('[consolidado GET]', err);
    res.status(500).json({ ok: false, error: 'Error al armar el consolidado' });
  }
});

// ── POST / ────────────────────────────────────────────────────────────────────

router.post('/', requireAuth, requireRol(ROLES.ENCARGADO_GENERAL), async (req, res) => {
  try {
    const {
      fecha, explicaciones, vencimientos_ok,
      acciones_vencimientos, faltas_tardanzas, control_tienda_ok, planes,
    } = req.body;

    const f = fecha || hoyStr();

    const previo = await pool.query('SELECT estado FROM consolidados WHERE fecha = $1', [f]);
    if (previo.rowCount && previo.rows[0].estado === 'cerrado') {
      return res.status(409).json({ ok: false, error: 'El día ya fue cerrado' });
    }

    const { rows } = await pool.query(`
      INSERT INTO consolidados
        (fecha, usuario_id, explicaciones, vencimientos_ok,
         acciones_vencimientos, faltas_tardanzas, control_tienda_ok)
      VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7)
      ON CONFLICT (fecha) DO UPDATE SET
        explicaciones         = EXCLUDED.explicaciones,
        vencimientos_ok       = EXCLUDED.vencimientos_ok,
        acciones_vencimientos = EXCLUDED.acciones_vencimientos,
        faltas_tardanzas      = EXCLUDED.faltas_tardanzas,
        control_tienda_ok     = EXCLUDED.control_tienda_ok,
        updated_at            = NOW()
      RETURNING *
    `, [
      f, req.user.id,
      JSON.stringify(explicaciones || {}),
      !!vencimientos_ok, acciones_vencimientos || null,
      faltas_tardanzas || null, !!control_tienda_ok,
    ]);

    // Cómo va a resolver cada mantenimiento pendiente. Vive en el ítem, no en el
    // día: mañana sigue ahí sin que lo tenga que volver a escribir.
    for (const [id, plan] of Object.entries(planes || {})) {
      if (!/^\d+$/.test(id)) continue;
      await pool.query(`
        UPDATE mantenimiento_items
        SET plan = $2, plan_por = $3, plan_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND plan IS DISTINCT FROM $2
      `, [Number(id), String(plan || '').trim() || null, req.user.id]);
    }

    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error('[consolidado POST]', err);
    res.status(500).json({ ok: false, error: 'Error al guardar el consolidado' });
  }
});

// ── GET /pdf ──────────────────────────────────────────────────────────────────
// El cierre del día en PDF, para mandarlo como adjunto. Se arma en el momento con
// los mismos datos de la pantalla: no hay archivo guardado que pueda quedar viejo.
router.get('/pdf', requireAuth, requireRol(ROLES.ENCARGADO_GENERAL), async (req, res) => {
  try {
    const fecha = req.query.fecha || hoyStr();
    const d = await armarDia(fecha);
    const cerradoPor = d.consolidado?.usuario_id
      ? (await pool.query('SELECT nombre FROM usuarios WHERE id = $1', [d.consolidado.usuario_id])).rows[0]?.nombre
      : null;
    const { pdfCierre } = require('../services/pdfCierre');
    const buffer = await pdfCierre(d, cerradoPor);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Cierre ${fecha}.pdf"`);
    res.send(buffer);
  } catch (err) {
    console.error('[consolidado/pdf]', err);
    res.status(500).json({ ok: false, error: 'No se pudo armar el PDF' });
  }
});

// ── POST /cerrar ──────────────────────────────────────────────────────────────

router.post('/cerrar', requireAuth, requireRol(ROLES.ENCARGADO_GENERAL), async (req, res) => {
  try {
    const fecha = req.body.fecha || hoyStr();
    const dia = await armarDia(fecha);
    const c = dia.consolidado;

    if (!c) return res.status(400).json({ ok: false, error: 'Guardá el consolidado antes de cerrarlo' });
    if (c.estado === 'cerrado') return res.status(409).json({ ok: false, error: 'El día ya está cerrado' });

    const faltan = [];

    // Dos cosas distintas: que falte un turno por cargar, y que lo cargado no cierre.
    // El umbral de $1 evita frenar el cierre por redondeos.
    for (const l of dia.locales) {
      if (l.turnos_esperados > 0 && !l.completo) {
        faltan.push(
          `Falta${l.turnos_esperados - l.turnos_reportados === 1 ? '' : 'n'} ` +
          `${l.turnos_esperados - l.turnos_reportados} reporte(s) de turno en ${l.nombre}`
        );
        continue;
      }
      if (l.diferencia !== null && Math.abs(l.diferencia) >= 1 &&
          !c.explicaciones?.[String(l.local_id)]?.trim()) {
        faltan.push(`Explicá por qué ${l.nombre} no cierra contra lo que reportaron los turnos`);
      }
    }
    // El día se cierra sobre reportes revisados. Uno devuelto está esperando que la
    // persona lo corrija; uno enviado sin abrir todavía no lo miró nadie. En los dos
    // casos el cierre es prematuro, y el mensaje dice a quién le falta qué.
    const sinAprobar = dia.locales.flatMap(l =>
      l.reportes.filter(r => r.estado !== 'aprobado').map(r => ({ ...r, local: l.nombre }))
    );
    for (const r of sinAprobar) {
      faltan.push(r.estado === 'observado'
        ? `${r.usuario_nombre} (${r.local}, ${r.turno.toLowerCase()}) todavía no corrigió el reporte que le devolviste`
        : `Falta revisar y aprobar el reporte de ${r.usuario_nombre} (${r.local}, ${r.turno.toLowerCase()})`);
    }

    if (!c.vencimientos_ok) faltan.push('Confirmá el control de vencimientos');
    if (!c.control_tienda_ok) faltan.push('Confirmá el control de tienda');
    if (dia.novedades.vencimientos.length && !c.acciones_vencimientos?.trim()) {
      faltan.push('Escribí qué acciones tomaste sobre los vencimientos reportados');
    }
    // Los dueños no necesitan la lista de lo roto: necesitan saber qué se va a hacer.
    for (const it of dia.novedades.mantenimiento) {
      if (it.id && it.estado === 'abierto' && !it.plan?.trim()) {
        faltan.push(`Decí cómo vas a resolver “${it.texto}” (${it.local})`);
      }
    }

    if (faltan.length) {
      return res.status(400).json({ ok: false, error: 'Falta completar el cierre', data: { faltan } });
    }

    await pool.query(
      `UPDATE consolidados SET estado = 'cerrado', cerrado_at = NOW(), updated_at = NOW() WHERE fecha = $1`,
      [fecha]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[consolidado/cerrar]', err);
    res.status(500).json({ ok: false, error: 'Error al cerrar el día' });
  }
});

// ── POST /reabrir ─────────────────────────────────────────────────────────────
// Solo el dueño puede reabrir un día ya cerrado.

router.post('/reabrir', requireAuth, async (req, res) => {
  try {
    if (req.user.rol !== ROLES.ADMIN) {
      return res.status(403).json({ ok: false, error: 'Solo un dueño puede reabrir un día cerrado' });
    }
    const fecha = req.body.fecha || hoyStr();
    const { rowCount } = await pool.query(
      `UPDATE consolidados SET estado = 'borrador', cerrado_at = NULL, updated_at = NOW()
       WHERE fecha = $1 AND estado = 'cerrado'`, [fecha]
    );
    if (!rowCount) return res.status(404).json({ ok: false, error: 'Ese día no está cerrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[consolidado/reabrir]', err);
    res.status(500).json({ ok: false, error: 'Error al reabrir el día' });
  }
});

module.exports = router;
module.exports.armarDia = armarDia;
module.exports.armarSemana = armarSemana;
module.exports.resumenSemana = resumenSemana;
