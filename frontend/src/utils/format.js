export function formatARS(amount) {
  if (amount == null || amount === '') return '-';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(Number(amount));
}

export function formatDate(dateStr) {
  if (!dateStr) return '-';
  // Treat YYYY-MM-DD as local date (no timezone shift)
  if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }
  const d = new Date(dateStr);
  if (isNaN(d)) return '-';
  return d.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d)) return '-';
  return d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
}

export function formatNumber(n) {
  if (n == null) return '-';
  return new Intl.NumberFormat('es-AR').format(Number(n));
}

export function today() {
  return new Date().toISOString().split('T')[0];
}

export function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
