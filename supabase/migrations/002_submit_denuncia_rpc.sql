-- ============================================================
-- ATALAYA PANÓPTICA — Migración: Función RPC para denuncias ciudadanas
-- ============================================================
-- INSTRUCCIONES:
-- 1. Ve a https://supabase.com/dashboard/project/_/sql/new
-- 2. Pega TODO este script
-- 3. Haz clic en "Run"
-- ============================================================
-- Esta función usa SECURITY DEFINER para que el usuario anónimo
-- pueda insertar en investigation_queue sin necesitar acceso directo
-- a la tabla (bypassa RLS de forma controlada).
-- ============================================================

-- 1. Crear la función RPC con SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.submit_denuncia(
  p_raw_text        TEXT,
  p_source_url      TEXT,
  p_raw_metadata    JSONB,
  p_source_hash     TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Solo permitir source = 'ciudadano' (protege contra abuso)
  INSERT INTO public.investigation_queue (
    source,
    raw_text,
    source_url,
    raw_metadata,
    source_hash,
    priority,
    status
  )
  VALUES (
    'ciudadano',
    p_raw_text,
    p_source_url,
    p_raw_metadata,
    p_source_hash,
    1,       -- Máxima prioridad: denuncias ciudadanas primero
    'pending'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 2. Dar permiso de EXECUTE al rol anónimo
GRANT EXECUTE ON FUNCTION public.submit_denuncia(TEXT, TEXT, JSONB, TEXT) TO anon;

-- 3. Verificar
SELECT routine_name, routine_type, security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'submit_denuncia';
