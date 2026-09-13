-- El encargado general también reporta faltas y tardanzas por su cuenta (lo que vio él,
-- no solo lo que cargaron los turnos). Va en el cierre, al lado de mantenimiento.
ALTER TABLE consolidados ADD COLUMN IF NOT EXISTS faltas_tardanzas TEXT;
