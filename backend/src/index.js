require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const express = require('express');
const cors    = require('cors');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

app.use('/api/auth',      require('./routes/auth'));
app.use('/api/locales',   require('./routes/locales'));
app.use('/api/empleados', require('./routes/empleados'));
app.use('/api/ventas',    require('./routes/ventas'));

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date() }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`ALFALCA backend → http://localhost:${PORT}`));
