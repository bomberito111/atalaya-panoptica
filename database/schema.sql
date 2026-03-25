-- ============================================================
-- ATALAYA PANÓPTICA — Schema Principal de Base de Datos
-- Supabase (PostgreSQL) — Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- Extensiones requeridas
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- Para búsqueda de texto fuzzy

-- ============================================================
-- TABLA: investigation_queue
-- Cola FIFO Rastreador → Detective
-- ============================================================
CREATE TABLE IF NOT EXISTS investigation_queue (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source          TEXT NOT NULL,          -- 'mercado_publico' | 'contraloria' | 'twitter_x' ...
    source_url      TEXT,                   -- URL original del dato
    source_hash     TEXT UNIQUE,            -- SHA-256 de source_url para deduplicación
    raw_text        TEXT NOT NULL,          -- Texto crudo extraído
    raw_metadata    JSONB DEFAULT '{}',     -- Fecha, autor, título, contexto
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'done', 'error')),
    priority        INT DEFAULT 5           -- 1=alta urgencia ... 10=baja
                    CHECK (priority BETWEEN 1 AND 10),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at    TIMESTAMPTZ,
    error_msg       TEXT,
    retry_count     INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_queue_status_priority
    ON investigation_queue (status, priority, created_at)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_queue_source
    ON investigation_queue (source);

-- ============================================================
-- TABLA: nodes
-- Entidades del grafo: personas, empresas, contratos, etc.
-- ============================================================
CREATE TABLE IF NOT EXISTS nodes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_type       TEXT NOT NULL
                    CHECK (node_type IN ('persona', 'empresa', 'contrato', 'institucion', 'cuenta_social')),
    canonical_name  TEXT NOT NULL,          -- Nombre normalizado y limpio
    rut             TEXT,                   -- RUT chileno (12.345.678-9)
    aliases         TEXT[] DEFAULT '{}',    -- Otros nombres detectados
    metadata        JSONB DEFAULT '{}',     -- Cargo, partido, URL perfil, fecha fundación, etc.
    risk_score      FLOAT DEFAULT 0.0       -- 0.0 a 1.0 calculado por Groq
                    CHECK (risk_score BETWEEN 0.0 AND 1.0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Evitar duplicados por RUT o por nombre+tipo
CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_rut
    ON nodes (rut)
    WHERE rut IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_type_name
    ON nodes (node_type, canonical_name);

CREATE INDEX IF NOT EXISTS idx_nodes_risk
    ON nodes (risk_score DESC);

CREATE INDEX IF NOT EXISTS idx_nodes_type
    ON nodes (node_type);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER nodes_updated_at
    BEFORE UPDATE ON nodes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TABLA: edges
-- Relaciones del grafo entre entidades
-- ============================================================
CREATE TABLE IF NOT EXISTS edges (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_node_id  UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_node_id  UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    relation_type   TEXT NOT NULL,          -- 'firmó_contrato' | 'es_socio_de' | 'lobbió_a' | 'financió_campaña' | 'es_familiar_de' | 'trabaja_en'
    weight          FLOAT DEFAULT 1.0       -- Fuerza de la relación
                    CHECK (weight > 0),
    evidence_url    TEXT,                   -- Link al documento fuente
    evidence_text   TEXT,                   -- Extracto relevante del documento
    detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    queue_item_id   UUID REFERENCES investigation_queue(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_edges_source
    ON edges (source_node_id);

CREATE INDEX IF NOT EXISTS idx_edges_target
    ON edges (target_node_id);

CREATE INDEX IF NOT EXISTS idx_edges_relation
    ON edges (relation_type);

-- Evitar relaciones duplicadas del mismo tipo entre los mismos nodos
CREATE UNIQUE INDEX IF NOT EXISTS idx_edges_unique_relation
    ON edges (source_node_id, target_node_id, relation_type);

-- ============================================================
-- TABLA: anomalies
-- Anomalías detectadas por el motor IA
-- ============================================================
CREATE TABLE IF NOT EXISTS anomalies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anomaly_type    TEXT NOT NULL
                    CHECK (anomaly_type IN ('sobreprecio', 'conflicto_interes', 'puerta_giratoria', 'bot_network', 'fake_news', 'triangulacion', 'nepotismo')),
    confidence      FLOAT NOT NULL          -- 0.0 a 1.0 output de Groq
                    CHECK (confidence BETWEEN 0.0 AND 1.0),
    description     TEXT NOT NULL,          -- Resumen en español legible
    entities        UUID[] DEFAULT '{}',    -- node IDs involucrados
    evidence        JSONB DEFAULT '{}',     -- URLs, extractos, cálculos de sobreprecios
    status          TEXT NOT NULL DEFAULT 'activa'
                    CHECK (status IN ('activa', 'desestimada', 'confirmada', 'en_investigacion')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    queue_item_id   UUID REFERENCES investigation_queue(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_anomalies_confidence
    ON anomalies (confidence DESC)
    WHERE status = 'activa';

CREATE INDEX IF NOT EXISTS idx_anomalies_type
    ON anomalies (anomaly_type);

CREATE TRIGGER anomalies_updated_at
    BEFORE UPDATE ON anomalies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TABLA: manipulation_alerts
-- Alertas de bots, granjas de cuentas y fake news
-- ============================================================
CREATE TABLE IF NOT EXISTS manipulation_alerts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type      TEXT NOT NULL
                    CHECK (alert_type IN ('bot_farm', 'coordinated_inauthentic', 'fake_news', 'astroturfing', 'narrative_hijacking')),
    narrative       TEXT NOT NULL,          -- La narrativa manipuladora detectada
    platform        TEXT NOT NULL,          -- 'twitter_x' | 'facebook' | 'instagram' | 'tiktok' | 'multiple'
    evidence        JSONB DEFAULT '{}',     -- Patrones: frecuencia, horarios pico, vocabulario repetido, cuentas
    official_data   JSONB DEFAULT '{}',     -- Datos del Estado que desmienten o confirman
    confidence      FLOAT NOT NULL
                    CHECK (confidence BETWEEN 0.0 AND 1.0),
    is_public       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    anomaly_id      UUID REFERENCES anomalies(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_alerts_confidence
    ON manipulation_alerts (confidence DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_platform
    ON manipulation_alerts (platform);

CREATE INDEX IF NOT EXISTS idx_alerts_type
    ON manipulation_alerts (alert_type);

-- ============================================================
-- TABLA: viral_content
-- Contenido periodístico generado automáticamente por Groq
-- ============================================================
CREATE TABLE IF NOT EXISTS viral_content (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type    TEXT NOT NULL
                    CHECK (content_type IN ('twitter_thread', 'tiktok_script', 'instagram_post', 'press_release')),
    content_text    TEXT NOT NULL,          -- El hilo, guion o nota generada
    trigger_anomaly UUID REFERENCES anomalies(id) ON DELETE SET NULL,
    confidence      FLOAT NOT NULL          -- Heredado de la anomalía
                    CHECK (confidence BETWEEN 0.0 AND 1.0),
    published       BOOLEAN DEFAULT FALSE,
    published_at    TIMESTAMPTZ,
    platform_url    TEXT,                   -- URL del post una vez publicado
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_viral_published
    ON viral_content (published, created_at DESC);

-- ============================================================
-- TABLA: promises_vs_reality
-- Promesas políticas en RRSS vs datos del Estado
-- ============================================================
CREATE TABLE IF NOT EXISTS promises_vs_reality (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    politician_id   UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    promise_text    TEXT NOT NULL,          -- La promesa textual
    promise_source  TEXT,                   -- URL del tweet/post/discurso
    promise_date    DATE,
    reality_text    TEXT,                   -- Dato oficial que confirma o desmiente
    reality_source  TEXT,                   -- URL de la fuente oficial
    reality_date    DATE,
    verdict         TEXT                    -- 'cumplida' | 'incumplida' | 'parcial' | 'pendiente' | 'sin_datos'
                    CHECK (verdict IN ('cumplida', 'incumplida', 'parcial', 'pendiente', 'sin_datos')),
    verified_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    queue_item_id   UUID REFERENCES investigation_queue(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_promises_politician
    ON promises_vs_reality (politician_id);

CREATE INDEX IF NOT EXISTS idx_promises_verdict
    ON promises_vs_reality (verdict);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Lectura pública, escritura solo desde service_role (backend)
-- ============================================================
ALTER TABLE investigation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE nodes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE edges               ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomalies           ENABLE ROW LEVEL SECURITY;
ALTER TABLE manipulation_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE viral_content       ENABLE ROW LEVEL SECURITY;
ALTER TABLE promises_vs_reality ENABLE ROW LEVEL SECURITY;

-- Política: lectura pública para el frontend
CREATE POLICY "public_read_nodes"               ON nodes               FOR SELECT USING (true);
CREATE POLICY "public_read_edges"               ON edges               FOR SELECT USING (true);
CREATE POLICY "public_read_anomalies"           ON anomalies           FOR SELECT USING (status != 'desestimada');
CREATE POLICY "public_read_alerts"              ON manipulation_alerts FOR SELECT USING (is_public = true);
CREATE POLICY "public_read_viral"               ON viral_content       FOR SELECT USING (published = true);
CREATE POLICY "public_read_promises"            ON promises_vs_reality FOR SELECT USING (true);

-- Política: escritura solo service_role (los scripts de Python usan SUPABASE_SERVICE_KEY)
CREATE POLICY "service_write_queue"   ON investigation_queue FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_write_nodes"   ON nodes               FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_write_edges"   ON edges               FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_write_anomaly" ON anomalies           FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_write_alerts"  ON manipulation_alerts FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_write_viral"   ON viral_content       FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_write_promises" ON promises_vs_reality FOR ALL USING (auth.role() = 'service_role');
