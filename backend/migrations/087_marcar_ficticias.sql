-- Marca las ventas ficticias que ya estaban cargadas (misma regla que utils/ficticias.js).
UPDATE ventas_tickets SET estado = 'ficticia', updated_at = NOW()
WHERE estado = 'cerrada' AND fecha >= '2026-08-01' AND lower(trim(cliente)) IN ('-', 'ficticia', 'ficticio');

UPDATE ventas_items vi SET cancelada = true, cancelada_por = 'Venta ficticia'
FROM ventas_tickets vt
WHERE vt.id = vi.ticket_id AND vt.estado = 'ficticia' AND NOT COALESCE(vi.cancelada, false);
