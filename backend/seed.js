require('dotenv').config({ path: '../.env' });
const { Pool }  = require('pg');
const bcrypt    = require('bcrypt');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function seed() {
  // ── Admin ──────────────────────────────────────────────
  const hash = await bcrypt.hash('Alfalca2026!', 12);
  await pool.query(`
    INSERT INTO usuarios (email, password_hash, nombre, rol)
    VALUES ('martin@alfalca.com.ar', $1, 'Martín (Admin)', 'admin')
    ON CONFLICT (email) DO NOTHING
  `, [hash]);
  console.log('✓ Admin: martin@alfalca.com.ar / Alfalca2026!');

  // ── Locales ────────────────────────────────────────────
  const locales = [
    { codigo: 'amigorena',    nombre: 'Amigorena Tienda de Alfajores', tipo: 'alfajores', dir: 'Amigorena' },
    { codigo: 'nuevedejulio', nombre: '9 de Julio Tienda de Alfajores', tipo: 'alfajores', dir: '9 de Julio' },
    { codigo: 'peatonal',     nombre: 'Peatonal Tienda de Alfajores',   tipo: 'alfajores', dir: 'Peatonal' },
    { codigo: 'sheraton',     nombre: 'Sheraton Tienda de Alfajores',   tipo: 'alfajores', dir: 'Sheraton' },
    { codigo: 'cafe_peatonal',nombre: 'Café Peatonal Cafetería',        tipo: 'cafeteria', dir: 'Peatonal' },
  ];

  for (const l of locales) {
    await pool.query(`
      INSERT INTO locales (codigo, nombre, tipo, direccion)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (codigo) DO NOTHING
    `, [l.codigo, l.nombre, l.tipo, l.dir]);
    console.log(`✓ Local: ${l.nombre}`);
  }

  await pool.end();
  console.log('\nSeed completado.');
}

seed().catch(err => { console.error('Error:', err.message); process.exit(1); });
