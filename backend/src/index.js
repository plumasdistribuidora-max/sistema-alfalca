require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
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

app.use('/api/auth',      require('./routes/auth'));
app.use('/api/locales',   require('./routes/locales'));
app.use('/api/empleados', require('./routes/empleados'));
app.use('/api/ventas',    require('./routes/ventas'));
app.use('/api/productos', require('./routes/productos'));
app.use('/api/red',      require('./routes/red'));
app.use('/api/stock',   require('./routes/stock'));
app.use('/api/imports',  require('./routes/imports'));

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date() }));

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
