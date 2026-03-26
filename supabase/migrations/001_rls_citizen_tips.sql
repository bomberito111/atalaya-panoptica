-- ATALAYA PANÓPTICA — Migración RLS
-- Ejecutar en Supabase Dashboard → SQL Editor
-- Permite que usuarios anónimos envíen denuncias ciudadanas

-- 1. Habilitar RLS si no está habilitado
ALTER TABLE investigation_queue ENABLE ROW LEVEL SECURITY;

-- 2. Política: anónimos pueden insertar SOLO si source = 'ciudadano'
CREATE POLICY IF NOT EXISTS "ciudadanos_pueden_denunciar"
ON investigation_queue
FOR INSERT
TO anon
WITH CHECK (source = 'ciudadano');

-- 3. El servicio (scripts Python) puede leer/actualizar/escribir todo
CREATE POLICY IF NOT EXISTS "service_full_access"
ON investigation_queue
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4. Anónimos NO pueden leer la cola (privacidad de denuncias)
-- (No se crea política SELECT para anon → por defecto bloqueado)

-- Verificar
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename = 'investigation_queue';
