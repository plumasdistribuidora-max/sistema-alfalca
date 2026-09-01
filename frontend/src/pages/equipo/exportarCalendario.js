// Dibuja el calendario en un canvas y lo baja como PNG, para mandar por WhatsApp.
//
// No es una captura de la pantalla: se redibuja con medidas pensadas para leerse
// en un celular. La grilla de la web tiene celdas de 46px porque entra en scroll;
// una imagen que se mira sin scroll necesita más aire.

const DIA_INICIAL = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MES_LARGO = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' });

const COLOR = {
  fondo:      '#FFFFFF',
  cabecera:   '#4C1D95',
  cabTexto:   '#FFFFFF',
  cabSuave:   'rgba(255,255,255,0.65)',
  tinta:      '#1F2937',
  tintaSuave: '#8B8595',
  linea:      '#E4E0DC',
  lineaFuerte:'#B9AEDB',
  bloque:     '#F1ECFB',
  bloqueTxt:  '#4C1D95',
  finde:      '#FAFAF7',
  cubierto:   '#EAF6EE',
  cubiertoTxt:'#15803D',
  franco:     '#FBEAE9',
  francoTxt:  '#B91C1C',
  alerta:     '#FBF0E0',
  alertaTxt:  '#8A5200',
  vacio:      '#FFFFFF',
};

function corto(nombre) {
  const [pila, apellido] = nombre.trim().split(/\s+/);
  if (!apellido) return pila.length <= 10 ? pila : pila.slice(0, 9) + '.';
  const base = pila.length <= 7 ? pila : pila.slice(0, 7);
  return `${base} ${apellido[0]}.`;
}

/**
 * @param {object} d        respuesta de /calendario/:local/:mes
 * @param {array}  dias     los días a dibujar (el mes entero o una semana)
 * @param {string} titulo   subtítulo bajo el nombre del local
 */
export function dibujarCalendario(d, dias, titulo) {
  const anchoDia = dias.length > 10 ? 62 : 128;
  const COL_PUESTO = 152, COL_HORA = 92;
  const ALTO_FILA = 38, ALTO_BLOQUE = 30, ALTO_CAB = 96, ALTO_DIAS = 52, ALTO_PIE = 54;

  const bloques = [...new Set(d.posiciones.map(p => p.turno))];
  const ancho = COL_PUESTO + COL_HORA + dias.length * anchoDia;
  const alto = ALTO_CAB + ALTO_DIAS
    + bloques.length * ALTO_BLOQUE
    + d.posiciones.length * ALTO_FILA
    + ALTO_PIE;

  // El doble de píxeles para que no se vea borroso al hacer zoom en el teléfono.
  const escala = 2;
  const canvas = document.createElement('canvas');
  canvas.width = ancho * escala;
  canvas.height = alto * escala;
  const c = canvas.getContext('2d');
  c.scale(escala, escala);
  c.textBaseline = 'middle';

  c.fillStyle = COLOR.fondo;
  c.fillRect(0, 0, ancho, alto);

  // ── Cabecera ───────────────────────────────────────────────────────────────
  c.fillStyle = COLOR.cabecera;
  c.fillRect(0, 0, ancho, ALTO_CAB);
  c.fillStyle = COLOR.cabSuave;
  c.font = '600 13px Inter, system-ui, sans-serif';
  c.fillText(d.local.nombre.toUpperCase(), 24, 32);
  c.fillStyle = COLOR.cabTexto;
  c.font = '800 30px Nunito, system-ui, sans-serif';
  const cab = titulo || MES_LARGO.format(new Date(`${d.mes}-15T12:00:00`));
  c.fillText(cab.charAt(0).toUpperCase() + cab.slice(1), 24, 64);

  let y = ALTO_CAB;

  // ── Encabezado de días ─────────────────────────────────────────────────────
  c.fillStyle = COLOR.finde;
  c.fillRect(0, y, ancho, ALTO_DIAS);
  c.font = '700 11px Inter, system-ui, sans-serif';
  c.fillStyle = COLOR.tintaSuave;
  c.textAlign = 'left';
  c.fillText('PUESTO', 14, y + ALTO_DIAS / 2);
  c.fillText('HORARIO', COL_PUESTO + 10, y + ALTO_DIAS / 2);

  dias.forEach((dia, i) => {
    const x = COL_PUESTO + COL_HORA + i * anchoDia;
    if (dia.finde) {
      c.fillStyle = '#EFEBF7';
      c.fillRect(x, y, anchoDia, ALTO_DIAS);
    }
    c.textAlign = 'center';
    c.fillStyle = COLOR.tintaSuave;
    c.font = '600 11px Inter, system-ui, sans-serif';
    c.fillText(DIA_INICIAL[dia.dow], x + anchoDia / 2, y + 16);
    c.fillStyle = COLOR.tinta;
    c.font = '700 15px Inter, system-ui, sans-serif';
    c.fillText(String(dia.n), x + anchoDia / 2, y + 35);
  });
  y += ALTO_DIAS;

  // ── Filas ──────────────────────────────────────────────────────────────────
  const celdaDe = (posId, fs) => d.celdas.find(x => x.posicion_id === posId && x.fecha === fs);

  for (const bloque of bloques) {
    c.fillStyle = COLOR.bloque;
    c.fillRect(0, y, ancho, ALTO_BLOQUE);
    c.fillStyle = COLOR.bloqueTxt;
    c.font = '800 12px Inter, system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillText(bloque.toUpperCase(), 14, y + ALTO_BLOQUE / 2);
    y += ALTO_BLOQUE;

    for (const p of d.posiciones.filter(x => x.turno === bloque)) {
      c.fillStyle = COLOR.tinta;
      c.font = '600 13px Inter, system-ui, sans-serif';
      c.textAlign = 'left';
      c.fillText(p.nombre, 14, y + ALTO_FILA / 2);

      c.fillStyle = COLOR.tintaSuave;
      c.font = '400 11px Inter, system-ui, sans-serif';
      c.fillText(p.hora_desde ? `${p.hora_desde}–${p.hora_hasta}` : '', COL_PUESTO + 10, y + ALTO_FILA / 2);

      dias.forEach((dia, i) => {
        const x = COL_PUESTO + COL_HORA + i * anchoDia;
        const celda = celdaDe(p.id, dia.fs);
        const emp = celda?.empleado_id ? d.empleados.find(e => e.id === celda.empleado_id) : null;
        const franco = celda?.estado === 'franco';
        const problema = emp && p.requiere_reporte && (!emp.carga_reporte || !emp.tiene_usuario);

        let fondo = dia.finde ? COLOR.finde : COLOR.vacio, texto = '', tinta = COLOR.tintaSuave;
        if (franco)      { fondo = COLOR.franco;   texto = 'Franco';        tinta = COLOR.francoTxt; }
        else if (emp)    { fondo = problema ? COLOR.alerta : COLOR.cubierto;
                           texto = corto(emp.nombre);
                           tinta = problema ? COLOR.alertaTxt : COLOR.cubiertoTxt; }

        c.fillStyle = fondo;
        c.fillRect(x + 1, y + 1, anchoDia - 2, ALTO_FILA - 2);

        if (texto) {
          c.fillStyle = tinta;
          c.font = `600 ${anchoDia > 100 ? 13 : 11}px Inter, system-ui, sans-serif`;
          c.textAlign = 'center';
          c.fillText(texto, x + anchoDia / 2, y + ALTO_FILA / 2);
        }
      });

      // Líneas de la fila
      c.strokeStyle = COLOR.linea;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(0, y + ALTO_FILA + 0.5);
      c.lineTo(ancho, y + ALTO_FILA + 0.5);
      c.stroke();
      y += ALTO_FILA;
    }
  }

  // ── Líneas verticales: cada día, más marcadas al empezar la semana ─────────
  const yGrilla = ALTO_CAB + ALTO_DIAS;
  dias.forEach((dia, i) => {
    const x = COL_PUESTO + COL_HORA + i * anchoDia;
    c.strokeStyle = dia.dow === 0 ? COLOR.lineaFuerte : COLOR.linea;
    c.lineWidth = dia.dow === 0 ? 2 : 1;
    c.beginPath();
    c.moveTo(x + 0.5, yGrilla);
    c.lineTo(x + 0.5, y);
    c.stroke();
  });
  c.strokeStyle = COLOR.lineaFuerte;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(COL_PUESTO + COL_HORA + 0.5, yGrilla);
  c.lineTo(COL_PUESTO + COL_HORA + 0.5, y);
  c.stroke();

  // ── Pie con la referencia ──────────────────────────────────────────────────
  const ref = [
    ['Trabaja', COLOR.cubierto, COLOR.cubiertoTxt],
    ['Franco',  COLOR.franco,   COLOR.francoTxt],
    ['Sin cubrir', COLOR.vacio, COLOR.tintaSuave],
  ];
  let x = 16;
  c.textAlign = 'left';
  for (const [txt, fondo, tinta] of ref) {
    c.fillStyle = fondo;
    c.fillRect(x, y + 20, 14, 14);
    c.strokeStyle = COLOR.linea;
    c.lineWidth = 1;
    c.strokeRect(x + 0.5, y + 20.5, 13, 13);
    c.fillStyle = tinta;
    c.font = '500 12px Inter, system-ui, sans-serif';
    c.fillText(txt, x + 21, y + 27);
    x += 21 + c.measureText(txt).width + 22;
  }
  c.fillStyle = COLOR.tintaSuave;
  c.font = '400 11px Inter, system-ui, sans-serif';
  c.textAlign = 'right';
  c.fillText('Alfalca Holding Group', ancho - 16, y + 27);

  return canvas;
}

export function bajarPng(canvas, nombreArchivo) {
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

// Los turnos de una sola persona, en texto: es lo que se le manda a cada uno
// por privado, en vez de la grilla entera del local.
// En la planilla "15.30" son las quince y media, no 15,3 decimales: el punto separa
// minutos. Sin esto, un turno de 8.00 a 15.30 daba 7,3 h en vez de 7,5.
function aDecimal(hora) {
  const m = String(hora ?? '').trim().match(/^(\d{1,2})[.:,](\d{1,2})$/);
  if (m) return Number(m[1]) + Number(m[2]) / 60;
  const entera = Number(String(hora ?? '').trim());
  return Number.isFinite(entera) ? entera : null;
}

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function textoDeEmpleado(d, dias, empleadoId) {
  const emp = d.empleados.find(e => e.id === empleadoId);
  if (!emp) return '';

  const lineas = [];
  let horas = 0;
  let sinCalcular = 0;

  for (const dia of dias) {
    const suyas = d.celdas.filter(c => c.fecha === dia.fs && c.empleado_id === empleadoId && c.estado === 'asignado');
    for (const celda of suyas) {
      const p = d.posiciones.find(x => x.id === celda.posicion_id);
      if (!p) continue;
      const desde = celda.hora_desde || p.hora_desde;
      const hasta = celda.hora_hasta || p.hora_hasta;
      const rango = desde ? ` · ${desde} a ${hasta}` : '';
      const fecha = `${DIAS_CORTOS[dia.fecha.getDay()]} ${dia.n}/${dia.fecha.getMonth() + 1}`;
      lineas.push(`${fecha} — ${p.nombre}${rango}`);

      const h1 = aDecimal(desde), h2 = aDecimal(hasta);
      if (h1 != null && h2 != null && h2 > h1) horas += h2 - h1;
      else sinCalcular++;
    }
  }

  if (!lineas.length) return `${emp.nombre}: no tenés turnos asignados en este período.`;

  const cabecera = `${emp.nombre} — tus turnos en ${d.local.nombre}`;
  let pie = '';
  if (horas > 0) {
    pie = `\n\nTotal: ${horas.toFixed(1)} h`;
    // Los turnos que cierran "a cierre" no tienen hora de fin, así que no suman.
    if (sinCalcular > 0) {
      pie += ` (más ${sinCalcular} turno${sinCalcular === 1 ? '' : 's'} hasta el cierre)`;
    }
  }
  return `${cabecera}\n\n${lineas.join('\n')}${pie}`;
}
