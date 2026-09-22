-- Un producto puede vivir en el mostrador, no solo en frío.
--
-- El modelo arrancaba con dos lugares, freezer y heladera, dando por sentado que todo
-- se guarda. El pan de Trigal y lo de Hojaldre no: llegan frescos todos los días y
-- están a la vista, en el mostrador. Con dos lugares había que mentirle al sistema y
-- marcarlos en heladera para poder contarlos.
--
-- Lo del mostrador no se baja del freezer —no hay de dónde— así que para esos la
-- respuesta útil no es "cuánto bajar" sino "cuánto pedir".
ALTER TABLE cocina_productos     ADD COLUMN IF NOT EXISTS en_mostrador BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE cocina_conteo_lineas ADD COLUMN IF NOT EXISTS mostrador    NUMERIC(10,2);

-- Hojaldre y Trigal son pan: van al mostrador y no ven el frío. Es lo que corresponde
-- hoy; si alguno además se congela, se marca desde la pantalla.
UPDATE cocina_productos
SET en_mostrador = true, en_freezer = false, en_heladera = false
WHERE proveedor IN ('Hojaldre', 'Trigal') AND NOT en_mostrador;

-- Reparación: algo que no está en ningún lado no se puede contar, y el formulario no
-- le dibuja ningún casillero. La validación vieja solo frenaba si llegaban los dos
-- lugares apagados en el mismo toque, así que apagándolos de a uno se podía dejar un
-- producto en el limbo. Vuelve a la heladera, que es el lugar más común, y desde la
-- pantalla se corrige si va a otro lado.
UPDATE cocina_productos
SET en_heladera = true
WHERE NOT en_freezer AND NOT en_heladera AND NOT en_mostrador;
