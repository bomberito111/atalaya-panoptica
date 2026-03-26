-- ============================================================
-- ATALAYA PANÓPTICA — Migración: Permisos para denuncias ciudadanas
-- ============================================================
-- INSTRUCCIONES:
-- 1. Ve a https://supabase.com/dashboard/project/_/sql/new
-- 2. Pega TODO este script
-- 3. Haz clic en "Run"
-- ============================================================

-- 1. Dar permiso de INSERT a usuarios anónimos en investigation_queue
GRANT INSERT ON TABLE public.investigation_queue TO anon;

-- 2. Habilitar RLS (Row Level Security)
ALTER TABLE public.investigation_queue ENABLE ROW LEVEL SECURITY;

-- 3. Política: anónimos pueden insertar SOLO denuncias ciudadanas
DROP POLICY IF EXISTS "ciudadanos_pueden_denunciar" ON public.investigation_queue;
CREATE POLICY "ciudadanos_pueden_denunciar"
ON public.investigation_queue
FOR INSERT
TO anon
WITH CHECK (source = 'ciudadano');

-- 4. El servicio Python (scripts con service_role) tiene acceso completo
DROP POLICY IF EXISTS "service_full_access" ON public.investigation_queue;
CREATE POLICY "service_full_access"
ON public.investigation_queue
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 5. Verificar que quedó bien
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE tablename = 'investigation_queue'
ORDER BY cmd;
