const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRol, ROLES } = require('../middleware/auth');

const router = express.Router();

function hoyStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

const n = v => Number(v) || 0;

// El placeholder de los campos de texto dice "Sin novedades", y la gente lo escribe
// tal cual en vez de dejarlo vacío. Sin esto, cada turno sube una novedad que no lo es.
const NADA = [
  'sin novedades', 'sin novedad', 'ninguna', 'ninguno', 'nada', 'no', 'no hubo',
  'todo bien', 'sin nada', 'n/a', 'na', '-', '--', '.', 'ok',
];
function esNovedad(texto) {
  const t = String(texto || '')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[.!,]/g, '').trim();
  return t !== '' && !NADA.includes(t);
}

// Las horas de un reporte según el tipo de plantilla: la de café trae las de todo
// el turno, las otras solo las de quien firma.
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
  const reportes = (await pool.query(`
    SELECT r.id, r.local_id, r.turno, r.estado, r.empleado_id, r.respuestas,
           r.plantilla_codigo, u.nombre AS usuario_nombre
    FROM reportes r
    JOIN usuarios u ON u.id = r.usuario_id
    WHERE r.fecha = $1 AND r.estado <> 'borrador'
    ORDER BY r.local_id, r.turno
  `, [fecha])).rows;

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

  const novedades = { vencimientos: [], mantenimiento: [], faltantes: [], ausencias: [], quejas: [] };

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

    for (const fila of horasDe(rep)) {
      const valor = valorDe[fila.empleado_id];
      acc.horas += fila.horas;
      if (valor) acc.gasto_personal += fila.horas * valor;
      else acc.horas_sin_valor += fila.horas;
    }

    // Novedades que el encargado tiene que mirar y resumir para los dueños.
    const local = porLocal[rep.local_id].nombre;
    if (r.vencimientos?.hubo) {
      for (const it of (r.vencimientos.items || [])) {
        novedades.vencimientos.push({ local, turno: rep.turno, ...it });
      }
    }
    if (esNovedad(r.mantenimiento)) {
      novedades.mantenimiento.push({ local, turno: rep.turno, texto: r.mantenimiento.trim() });
    }
    if (r.faltantes?.hubo) {
      for (const it of (r.faltantes.items || [])) {
        novedades.faltantes.push({ local, turno: rep.turno, ...it });
      }
    }
    if (r.ausencias?.hubo) {
      for (const it of (r.ausencias.items || [])) {
        novedades.ausencias.push({ local, turno: rep.turno, ...it });
      }
    }
    if (esNovedad(r.quejas)) {
      novedades.quejas.push({ local, turno: rep.turno, texto: r.quejas.trim() });
    }
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

  return {
    fecha, locales: filas, totales, novedades,
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

// El texto para WhatsApp. Primero lo que hay que saber, después el detalle.
function textoSemana(w) {
  const L = [];
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

  L.push(`*Resumen semanal — ${rango}*`);
  L.push(`Venta: ${$(ventaTotal)} · ${w.actual.total.tickets} tickets · ticket prom. ${w.actual.total.tickets ? $(ventaTotal / w.actual.total.tickets) : 's/d'}`);
  const vAnt = variacion(ventaTotal, w.anterior.total.total), vAnio = variacion(ventaTotal, w.anio.total.total);
  if (vAnt || vAnio) L.push(`vs semana anterior: ${vAnt || 's/d'}${vAnio ? ` · vs misma semana del año pasado: ${vAnio}` : ''}`);
  if (w.actual.total.docenas) L.push(`Docenas: ${money.format(w.actual.total.docenas)}${w.anterior.total.docenas ? ` (semana anterior ${money.format(w.anterior.total.docenas)})` : ''}`);
  L.push(`Personal: ${tot.horas.toFixed(1)} h · ${$(tot.gasto)}${kpiRed != null ? ` · ${pct(kpiRed)} de la venta ${kpiRed <= metaRed ? '✅' : '🔴'} (meta ${pct(metaRed)})` : ''}`
    + (kpiRed != null && diasConHoras < diasConVentas ? ` — sobre ${diasConHoras} de ${diasConVentas} días con reportes` : ''));
  if (tot.sin_valor > 0) L.push(`⚠️ ${tot.sin_valor.toFixed(1)} h sin valor hora cargado`);

  L.push('');
  L.push('*Por local*');
  for (const id of locales) {
    const v = w.actual.porLocal[id]?.total || 0;
    if (!v && !porLocal[id].horas) continue;
    const a = porLocal[id];
    const kpi = a.ventas_con_horas > 0 && a.gasto > 0 ? a.gasto / a.ventas_con_horas * 100 : null;
    const va = variacion(v, w.anterior.porLocal[id]?.total || 0);
    let linea = `• ${corto(nombreDe[id])}: ${$(v)}${va ? ` (${va})` : ''}`;
    if (kpi != null) linea += ` · personal ${pct(kpi)} ${kpi <= objetivoDe[id] ? '✅' : '🔴'} (meta ${objetivoDe[id]}%)`;
    L.push(linea);
    if (a.dias_kpi) {
      const enMeta = a.dias_en_meta, fuera = a.dias_kpi - enMeta;
      let lectura = `  ${enMeta} de ${a.dias_kpi} días en meta${a.dias_con_horas < a.dias_con_ventas ? ` (${a.dias_con_horas} de ${a.dias_con_ventas} días con reportes)` : ''}`;
      if (kpi != null && kpi <= objetivoDe[id] && fuera > 0) lectura += `, pero la semana cerró en meta`;
      if (kpi != null && kpi > objetivoDe[id] && enMeta > fuera) lectura += `, pero la semana cerró arriba de la meta`;
      L.push(lectura);
    }
    if (a.mejor && a.peor && a.mejor.dia !== a.peor.dia) L.push(`  mejor día ${a.mejor.dia} ${$(a.mejor.v)} · peor ${a.peor.dia} ${$(a.peor.v)}`);
    if (a.no_cierra.length) {
      L.push(`  🔴 no cerró ${a.no_cierra.length === 1 ? 'el' : 'los días'} ${a.no_cierra.map(x => `${x.dia} (${x.dif > 0 ? '+' : '−'}${money.format(Math.abs(x.dif))}${x.exp ? `: ${x.exp}` : ''})`).join(', ')}`);
    }
    if (a.dias_sin_reportes.length) L.push(`  ⚠️ faltaron reportes: ${a.dias_sin_reportes.join(', ')}`);
  }

  // Cómo funcionó el circuito.
  const cerrados = w.dias.filter(d => d.consolidado?.estado === 'cerrado').map(d => diaCorto(d.fecha));
  const sinCerrar = w.dias.filter(d => d.consolidado?.estado !== 'cerrado').map(d => diaCorto(d.fecha));
  let esperados = 0, recibidos = 0;
  for (const dia of w.dias) for (const l of dia.locales) { esperados += l.turnos_esperados; recibidos += Math.min(l.turnos_reportados, l.turnos_esperados); }
  L.push('');
  L.push('*Cómo funcionó la semana*');
  L.push(`• Días cerrados: ${cerrados.length} de 7${sinCerrar.length ? ` (sin cerrar: ${sinCerrar.join(', ')})` : ''}`);
  L.push(`• Reportes de venta: ${recibidos} de ${esperados} esperados`);
  if (w.tarde.length) L.push(`• Llegaron al día siguiente: ${w.tarde.length} (${[...new Set(w.tarde.map(t => t.usuario))].join(', ')})`);
  if (w.devueltos.length) L.push(`• Devueltos para corregir: ${w.devueltos.map(d => `${d.usuario} ${d.veces > 1 ? `×${d.veces}` : ''}`.trim()).join(', ')}`);

  // Novedades acumuladas, contadas.
  const todas = { vencimientos: [], mantenimiento: [], faltantes: [], ausencias: [], quejas: [] };
  for (const dia of w.dias) for (const k of Object.keys(todas)) for (const it of dia.novedades[k]) todas[k].push({ ...it, dia: diaCorto(dia.fecha) });
  const contar = (items, clave) => {
    const c = {};
    for (const it of items) { const k = clave(it); if (k) c[k] = (c[k] || 0) + 1; }
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  };
  if (todas.vencimientos.length) {
    L.push(''); L.push(`*Vencimientos* · ${todas.vencimientos.length} en la semana`);
    L.push(`• Por local: ${contar(todas.vencimientos, it => corto(it.local)).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
    const rep = contar(todas.vencimientos, it => (it.producto || '').trim().toLowerCase()).filter(([, v]) => v > 1);
    if (rep.length) L.push(`• Se repite: ${rep.map(([k, v]) => `${k} (${v})`).join(', ')}`);
  }
  if (todas.mantenimiento.length) {
    L.push(''); L.push(`*Mantenimiento reportado* · ${todas.mantenimiento.length}`);
    for (const it of todas.mantenimiento) L.push(`• ${corto(it.local)} (${it.dia}): ${it.texto}`);
  }
  for (const dia of w.dias) if (dia.consolidado?.mantenimiento?.trim()) L.push(`• Encargado (${diaCorto(dia.fecha)}): ${dia.consolidado.mantenimiento.trim()}`);
  if (todas.faltantes.length) {
    L.push(''); L.push(`*Faltantes de insumos* · ${todas.faltantes.length}`);
    for (const [k, v] of contar(todas.faltantes, it => `${(it.insumo || '').trim()}${it.proveedor ? ` (${it.proveedor})` : ''}`)) L.push(`• ${k}${v > 1 ? ` — ${v} veces` : ''}`);
  }
  if (todas.ausencias.length) {
    L.push(''); L.push(`*Faltas y tardanzas* · ${todas.ausencias.length}`);
    for (const [k, v] of contar(todas.ausencias, it => (it.empleado || '').trim())) {
      const motivos = todas.ausencias.filter(it => (it.empleado || '').trim() === k).map(it => `${it.dia}: ${it.motivo}`).join('; ');
      L.push(`• ${k} ×${v} — ${motivos}`);
    }
  }
  for (const dia of w.dias) if (dia.consolidado?.faltas_tardanzas?.trim()) L.push(`• Encargado (${diaCorto(dia.fecha)}): ${dia.consolidado.faltas_tardanzas.trim()}`);
  if (todas.quejas.length) {
    L.push(''); L.push(`*Quejas* · ${todas.quejas.length}`);
    for (const it of todas.quejas) L.push(`• ${corto(it.local)} (${it.dia}): ${it.texto}`);
  }

  const p = w.proveedores;
  if (p.pagado || p.deuda) {
    L.push(''); L.push('*Proveedores*');
    L.push(`• Pagado en la semana: ${$(p.pagado)}`);
    if (p.n_vencidas) L.push(`• 🔴 Vencidas sin pagar: ${p.n_vencidas} por ${$(p.vencido)}`);
    if (p.n_proxima) L.push(`• Vence la semana que viene: ${p.n_proxima} facturas por ${$(p.vence_proxima)}`);
    L.push(`• Deuda total: ${$(p.deuda)} en ${p.facturas} facturas`);
  }

  return L.join('\n');
}

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
      acciones_vencimientos, mantenimiento, faltas_tardanzas, control_tienda_ok,
    } = req.body;

    const f = fecha || hoyStr();

    const previo = await pool.query('SELECT estado FROM consolidados WHERE fecha = $1', [f]);
    if (previo.rowCount && previo.rows[0].estado === 'cerrado') {
      return res.status(409).json({ ok: false, error: 'El día ya fue cerrado' });
    }

    const { rows } = await pool.query(`
      INSERT INTO consolidados
        (fecha, usuario_id, explicaciones, vencimientos_ok,
         acciones_vencimientos, mantenimiento, faltas_tardanzas, control_tienda_ok)
      VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8)
      ON CONFLICT (fecha) DO UPDATE SET
        explicaciones         = EXCLUDED.explicaciones,
        vencimientos_ok       = EXCLUDED.vencimientos_ok,
        acciones_vencimientos = EXCLUDED.acciones_vencimientos,
        mantenimiento         = EXCLUDED.mantenimiento,
        faltas_tardanzas      = EXCLUDED.faltas_tardanzas,
        control_tienda_ok     = EXCLUDED.control_tienda_ok,
        updated_at            = NOW()
      RETURNING *
    `, [
      f, req.user.id,
      JSON.stringify(explicaciones || {}),
      !!vencimientos_ok, acciones_vencimientos || null,
      mantenimiento || null, faltas_tardanzas || null, !!control_tienda_ok,
    ]);

    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error('[consolidado POST]', err);
    res.status(500).json({ ok: false, error: 'Error al guardar el consolidado' });
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
