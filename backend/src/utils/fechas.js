// La fecha "de hoy" es la de Mendoza, no la del servidor. Railway corre en UTC, que va
// tres horas adelante: a las 21:00 de acá ya es mañana para él, y un reporte del turno
// tarde cargado a esa hora quedaba fechado al día siguiente.
const TZ = 'America/Argentina/Mendoza';

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

// YYYY-MM-DD de hoy en Mendoza.
function hoyStr() {
  return fmt.format(new Date());
}

module.exports = { TZ, hoyStr };
