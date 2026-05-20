'use strict';

function fmtNum(n) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Number(n) || 0);
}
function fmtPct(n) {
  return (Number(n) >= 0 ? '+' : '') + (Number(n) || 0).toFixed(1) + '%';
}
function fmtDoc(n) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(Number(n) || 0);
}
function mesNombre(yyyymm) {
  if (!yyyymm) return '';
  const [y, m] = yyyymm.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('es-AR', { month: 'long', year: 'numeric' });
}

/**
 * generarConclusiones(data)
 * data = { kpis, docenas_tendencia, totalizador_mensual, comparativo_quincenal, tiendas_mes_actual }
 */
function generarConclusiones(data) {
  const conclusiones = [];
  const {
    kpis = {},
    docenas_tendencia = {},
    totalizador_mensual = {},
    comparativo_quincenal = {},
    tiendas_resumen = [],
  } = data;

  // ── Helpers de series ────────────────────────────────────────────────────────

  const mesesDoc  = docenas_tendencia.meses || [];
  const docsArr   = docenas_tendencia.docenas_totales || [];
  const precioArr = docenas_tendencia.precio_por_docena || [];

  const filasFact = totalizador_mensual.modo_facturacion?.filas || [];

  // Primer mes completo y último mes completo (excluir mes parcial)
  const hoy       = new Date();
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  const mesesComp = mesesDoc.filter(m => m < mesActual);  // meses completos

  const idxPrimero = 0;
  const idxUltimo  = mesesComp.length - 1;

  // ── Regla 1: VOLUMEN VS PRECIO ───────────────────────────────────────────────
  if (mesesComp.length >= 2) {
    const idxI = mesesDoc.indexOf(mesesComp[idxPrimero]);
    const idxF = mesesDoc.indexOf(mesesComp[idxUltimo]);

    const docIni = Number(docsArr[idxI]) || 0;
    const docFin = Number(docsArr[idxF]) || 0;
    const pctDoc = docIni > 0 ? ((docFin - docIni) / docIni) * 100 : null;

    const filasComp = filasFact.filter(f => mesesComp.includes(f.mes));
    const factIni   = filasComp[0]?.total || 0;
    const factFin   = filasComp[filasComp.length - 1]?.total || 0;
    const pctFact   = factIni > 0 ? ((factFin - factIni) / factIni) * 100 : null;

    if (pctDoc !== null && pctFact !== null && pctDoc < 5 && pctFact > 5) {
      conclusiones.push({
        tipo:   'alerta',
        icono:  '📦',
        titulo: 'Crecimiento por precio, no por volumen',
        texto:  `Las docenas crecieron solo ${fmtPct(pctDoc)} de ${mesNombre(mesesComp[0])} a ${mesNombre(mesesComp[idxUltimo])}. La facturación subió de $${fmtNum(factIni)} a $${fmtNum(factFin)} (${fmtPct(pctFact)}), indicando crecimiento por precio, no por volumen. Señal de alerta para sostenibilidad.`,
      });
    }
  }

  // ── Regla 2: MEJOR ARRANQUE DE MES ──────────────────────────────────────────
  const tiendas = comparativo_quincenal.tiendas || [];
  if (tiendas.length > 0) {
    const mejor = tiendas.reduce((a, b) =>
      (Number(b.variacion_pct) > Number(a.variacion_pct) ? b : a), tiendas[0]);
    if (Number(mejor.variacion_pct) > 0) {
      const nDias  = comparativo_quincenal.n_dias || '';
      const mesLbl = comparativo_quincenal.mes_actual_label || '';
      conclusiones.push({
        tipo:   'positivo',
        icono:  '📈',
        titulo: `${mejor.nombre} lidera el arranque de ${mesLbl}`,
        texto:  `${mejor.nombre} lidera ${mesLbl}: ${fmtPct(mejor.variacion_pct)} vs los mismos ${nDias} días del mes anterior ($${fmtNum(mejor.facturacion_anterior)} → $${fmtNum(mejor.facturacion_actual)}). Mejor arranque de todas las tiendas.`,
      });
    }
  }

  // ── Regla 3: TIENDA EN CAÍDA ─────────────────────────────────────────────────
  if (tiendas.length > 0) {
    const peor = tiendas.reduce((a, b) =>
      (Number(b.variacion_pct) < Number(a.variacion_pct) ? b : a), tiendas[0]);
    if (Number(peor.variacion_pct) < -15) {
      const mesLbl = comparativo_quincenal.mes_actual_label || '';
      const nDias  = comparativo_quincenal.n_dias || '';
      conclusiones.push({
        tipo:   'alerta',
        icono:  '⚠️',
        titulo: `${peor.nombre} requiere atención`,
        texto:  `${peor.nombre} cayó ${fmtPct(peor.variacion_pct)} en ${mesLbl} vs los mismos ${nDias} días del mes anterior. Revisar feriados, stock o demanda.`,
      });
    }
  }

  // ── Regla 4: MEJOR MES EN DOCENAS ───────────────────────────────────────────
  if (mesesDoc.length > 0 && docsArr.length > 0) {
    let maxDoc = 0, maxMes = '';
    mesesDoc.forEach((m, i) => {
      if (Number(docsArr[i]) > maxDoc) { maxDoc = Number(docsArr[i]); maxMes = m; }
    });
    if (maxMes) {
      conclusiones.push({
        tipo:   'info',
        icono:  '🍫',
        titulo: `Mejor mes en docenas: ${mesNombre(maxMes)}`,
        texto:  `${mesNombre(maxMes)} fue el mejor mes en docenas alfajoreras (${fmtDoc(maxDoc)} doc). Evaluar acciones estacionales replicables.`,
      });
    }
  }

  // ── Regla 5: PRECIO IMPLÍCITO + TICKET BAJO ──────────────────────────────────
  if (kpis.precio_implicito_docena && tiendas_resumen.length > 0) {
    const alfajoreras = tiendas_resumen.filter(t => t.es_alfajorera && t.tickets > 0);
    if (alfajoreras.length > 1) {
      const promTicket = alfajoreras.reduce((s, t) => s + Number(t.prom_ticket), 0) / alfajoreras.length;
      const bajaTicket = alfajoreras.reduce((a, b) =>
        Number(b.prom_ticket) < Number(a.prom_ticket) ? b : a, alfajoreras[0]);
      if (Number(bajaTicket.prom_ticket) < promTicket * 0.75) {
        conclusiones.push({
          tipo:   'dinero',
          icono:  '💰',
          titulo: 'Precio implícito por docena y ticket bajo detectado',
          texto:  `Precio implícito por docena en la red: $${fmtNum(kpis.precio_implicito_docena)}. ${bajaTicket.nombre} tiene ticket promedio $${fmtNum(bajaTicket.prom_ticket)}, muy por debajo del resto ($${fmtNum(Math.round(promTicket))}). Revisar mix de productos.`,
        });
      }
    }
  }

  // ── Regla 6: TIENDA EN CRECIMIENTO SOSTENIDO ────────────────────────────────
  if (mesesComp.length >= 2 && filasFact.length >= 2) {
    const primerFila  = filasFact.find(f => f.mes === mesesComp[0]);
    const ultimaFila  = filasFact.find(f => f.mes === mesesComp[idxUltimo]);
    if (primerFila && ultimaFila) {
      const tiendaNombres = Object.keys(primerFila.por_tienda || {});
      let mejorTienda = null, mejorCrecimiento = 0;
      for (const t of tiendaNombres) {
        const ini = Number(primerFila.por_tienda[t]?.valor) || 0;
        const fin = Number(ultimaFila.por_tienda[t]?.valor) || 0;
        if (ini > 0) {
          const crec = ((fin - ini) / ini) * 100;
          if (crec > mejorCrecimiento) { mejorCrecimiento = crec; mejorTienda = { nombre: t, ini, fin }; }
        }
      }
      if (mejorTienda && mejorCrecimiento > 50) {
        conclusiones.push({
          tipo:   'trofeo',
          icono:  '🏆',
          titulo: `${mejorTienda.nombre} en crecimiento sostenido`,
          texto:  `${mejorTienda.nombre} pasó de $${fmtNum(mejorTienda.ini)} en ${mesNombre(mesesComp[0])} a $${fmtNum(mejorTienda.fin)} en ${mesNombre(mesesComp[idxUltimo])} (${fmtPct(mejorCrecimiento)}). Analizar qué funciona para replicar.`,
        });
      }
    }
  }

  return conclusiones;
}

module.exports = { generarConclusiones };
