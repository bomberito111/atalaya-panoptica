# 🏛️ ATALAYA PANÓPTICA

> Sistema de IA anticorrupción para Chile. Investigador digital autónomo del Estado chileno y su ecosistema sociopolítico.

**Costo: $0 | Stack: GitHub Actions + Supabase + Groq/Llama 3 + Next.js 14**

---

## Fases del Proyecto

| Fase | Estado | Descripción |
|------|--------|-------------|
| 1 | ✅ Completada | Fundación: DB schema, utils, estructura |
| 2 | 🔧 Lista para activar | Rastreador: Fuentes Estatales |
| 3 | 🔧 Lista para activar | Detective: Motor IA (Groq) |
| 4 | 📋 Pendiente | Rastreador: RRSS y prensa |
| 5 | 📋 Pendiente | Ciberseguridad: bots y fake news |
| 6 | 📋 Pendiente | Agente Viral: publicación autónoma |
| 7 | 🔧 Base lista | Frontend Next.js 14 |
| 8 | 📋 Pendiente | Fuentes estatales avanzadas |

## Setup Rápido

### 1. Supabase
1. Crear proyecto en [supabase.com](https://supabase.com)
2. Ir a SQL Editor → pegar y ejecutar `database/schema.sql`
3. Copiar `SUPABASE_URL` y `SUPABASE_SERVICE_KEY` de Settings > API

### 2. Groq
1. Crear cuenta en [console.groq.com](https://console.groq.com)
2. Crear API Key

### 3. GitHub Secrets
En tu repositorio: Settings > Secrets and variables > Actions:
```
SUPABASE_URL
SUPABASE_SERVICE_KEY
GROQ_API_KEY
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### 4. GitHub Pages
- Settings > Pages > Source: **GitHub Actions**
- El workflow `deploy-pages.yml` hará el deploy automáticamente

### 5. Variables opcionales (Actions Variables)
```
GROQ_MODEL=llama-3.3-70b-versatile
MAX_ITEMS_PER_RUN=3
CONFIDENCE_THRESHOLD_ANOMALY=0.60
CONFIDENCE_THRESHOLD_VIRAL=0.85
NEXT_PUBLIC_SITE_URL=https://tu-usuario.github.io/atalaya-panoptica
```

## Estructura del Proyecto

```
.github/workflows/     # Orquestación con GitHub Actions
scripts/
  rastreador/          # El Productor (fuentes estatales y web)
  detective/           # El Consumidor IA (Groq/Llama 3)
  agente_viral/        # Publicador de contenido periodístico
  utils/               # Supabase client, rate limiter, text cleaner
database/              # Schema SQL para Supabase
frontend/              # Next.js 14 App Router (static export)
```

## Arquitectura

```
Fuentes → Rastreador (12h) → investigation_queue → Detective (5min) → nodes/edges/anomalies → Frontend
                                                                    ↓
                                                            Agente Viral (1h) → viral_content → X/TikTok
```
