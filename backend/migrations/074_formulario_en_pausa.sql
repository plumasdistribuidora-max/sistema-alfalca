-- Un formulario en pausa (15/10/2026): sigue existiendo y se puede cargar, pero si no
-- llega no cuenta como faltante, no levanta la alerta "no cargó el reporte" ni aparece
-- como pendiente en la grilla. Si alguien lo carga igual, se ve como siempre.
-- La cocina del Café arranca en pausa: Martín ya sabe que no lo están cargando.
ALTER TABLE reporte_plantillas ADD COLUMN IF NOT EXISTS en_pausa BOOLEAN NOT NULL DEFAULT false;
UPDATE reporte_plantillas SET en_pausa = true WHERE codigo = 'cocina';
