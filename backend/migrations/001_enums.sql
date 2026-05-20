DO $$ BEGIN CREATE TYPE rol_usuario AS ENUM ('admin', 'encargado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE tipo_local AS ENUM ('alfajores', 'cafeteria'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE estado_ticket AS ENUM ('cerrada', 'eliminada', 'en_curso'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE tipo_import AS ENUM ('ventas', 'stock', 'gastos'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE status_import AS ENUM ('procesando', 'completado', 'error'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
