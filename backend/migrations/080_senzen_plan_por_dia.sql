-- Los comercios nuevos de Pepa, repartidos por día (23/10/2026).
--
-- Martín quiere decirle cuántos tiene que visitar por día o por semana, "pero que quede
-- bien dividido". Se guardan los siete días (lunes a domingo). Si los dueños ponen un
-- total para la semana, el sistema lo reparte entre los días que elijan y guarda el
-- resultado igual: Pepa siempre ve cuántos le tocan cada día.
ALTER TABLE senzen_semanas ADD COLUMN IF NOT EXISTS por_dia INT[];
ALTER TABLE senzen_semanas ADD COLUMN IF NOT EXISTS modo VARCHAR(6) NOT NULL DEFAULT 'semana';
ALTER TABLE senzen_semanas DROP CONSTRAINT IF EXISTS senzen_semanas_modo_check;
ALTER TABLE senzen_semanas ADD CONSTRAINT senzen_semanas_modo_check CHECK (modo IN ('semana', 'dia'));
ALTER TABLE senzen_semanas DROP CONSTRAINT IF EXISTS senzen_semanas_por_dia_check;
ALTER TABLE senzen_semanas ADD CONSTRAINT senzen_semanas_por_dia_check CHECK (por_dia IS NULL OR array_length(por_dia, 1) = 7);
