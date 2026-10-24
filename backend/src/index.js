require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

// El proceso entero vive en hora de Mendoza. Railway corre en UTC y cualquier
// `new Date()` que saque el día, el mes o el año se corría tres horas.
process.env.TZ = 'America/Argentina/Mendoza';
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

app.use(cors({
  origin: isProd ? true : (process.env.FRONTEND_URL || 'http://localhost:5173'),
  credentials: true,
}));
app.use(express.json());

const { requireAuth, requireAdmin, requireRol, ROLES } = require('./middleware/auth');

// Los módulos de red se cierran acá, a nivel de router. Esconderlos del menú no alcanza:
// sin esto, un empleado de tienda con su token puede pegarle a /api/red y ver toda la red.
const soloRed = [requireAuth, requireRol(ROLES.ENCARGADO_GENERAL)];

// Cash Flow es parte de Finanzas: solo el dueño. El EERR y los KPI viven adentro de
// /api/red y se cierran en su propio router.
const soloDueno = [requireAuth, requireAdmin];

app.use('/api/auth',      require('./routes/auth'));
app.use('/api/locales',   require('./routes/locales'));
app.use('/api/usuarios',  require('./routes/usuarios'));
app.use('/api/empleados', require('./routes/empleados'));
app.use('/api/reportes',  require('./routes/reportes'));
// Proveedores no se cierra acá: la lista la necesita el formulario del turno para
// elegir el proveedor. Las altas, las facturas a mano y los pagos se cierran
// endpoint por endpoint adentro del router.
app.use('/api/proveedores', require('./routes/proveedores'));
app.use('/api/consolidado', soloRed, require('./routes/consolidado'));
// Las tareas reemplazan al cierre del día. Las ven el encargado y los dueños.
app.use('/api/tareas',   soloRed, require('./routes/tareas'));
// Los avisos en el celular: cualquiera con usuario puede activarlos en su aparato.
app.use('/api/avisos',   require('./routes/avisos'));
app.use('/api/calendario', soloRed, require('./routes/calendario'));
app.use('/api/ventas',    soloRed, require('./routes/ventas'));
app.use('/api/productos', soloRed, require('./routes/productos'));
app.use('/api/red',       soloRed, require('./routes/red'));
app.use('/api/stock',     soloRed, require('./routes/stock'));
app.use('/api/imports',   soloRed, require('./routes/imports'));
app.use('/api/maestros',  soloRed, require('./routes/maestros'));
app.use('/api/cashflow',  soloDueno, require('./routes/cashflow'));
app.use('/api/eerr-manual', soloDueno, require('./routes/eerrManual'));
app.use('/api/kankay',    soloDueno, require('./routes/kankay'));
app.use('/api/tareas-duenos', soloDueno, require('./routes/tareasDuenos'));
app.use('/api/duenos',   soloDueno, require('./routes/duenos'));
// El asistente con Claude: solo el dueño, porque lee toda la base.
app.use('/api/asistente', soloDueno, require('./routes/asistente'));
app.use('/api/senzen',    [requireAuth, requireRol(ROLES.VENDEDORA)], require('./routes/senzen'));

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date() }));

// Cachea el maestro de docenas desde la base en startup (no bloquea el arranque)
require('./services/maestroDocenas').loadMaestro()
  .catch(err => console.warn('[startup] No se pudo cachear el maestro de docenas:', err.message));

// Avisos programados de Kankay (cierre del mes, el 20, recordatorio): se revisan una vez
// por hora. Cada aviso se manda una sola vez, aunque haya más de un proceso.
const kankayAvisos = require('./services/kankayAvisos');
setInterval(() => kankayAvisos.revisarProgramados()
  .catch(err => console.warn('[kankay avisos]', err.message)), 60 * 60 * 1000).unref();

// Senzen: cada hora trae Dux de Plumas, arma las tareas de Pepa y manda sus avisos.
const senzenAvisos = require('./services/senzenAvisos');
setInterval(() => senzenAvisos.revisar()
  .catch(err => console.warn('[senzen]', err.message)), 60 * 60 * 1000).unref();

// Tareas: los repasos de la mañana, de las 18 y lo vencido (services/tareasAvisos.js).
// Cada diez minutos, así el de las 8:30 sale a esa hora y no a las 9.
const tareasAvisos = require('./services/tareasAvisos');
setInterval(() => tareasAvisos.revisar()
  .catch(err => console.warn('[tareas avisos]', err.message)), 10 * 60 * 1000).unref();

// Dueños: el cierre del mes (del 1 al 5), el semáforo de los martes y la reunión del mes.
const duenosAvisos = require('./services/duenosAvisos');
setInterval(() => duenosAvisos.revisar()
  .catch(err => console.warn('[duenos avisos]', err.message)), 10 * 60 * 1000).unref();

if (isProd) {
  const distPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`ALFALCA backend → http://localhost:${PORT}`));
