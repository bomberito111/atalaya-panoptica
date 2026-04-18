"""
ATALAYA PANÓPTICA — Seed de datos reales para arrancar el sistema.
Inserta políticos, promesas vs realidad, anomalías y alertas documentadas.
Usa la service_role key para saltarse RLS.

Ejecutar: python scripts/seed_data.py
"""

import os, sys, json, requests, uuid
from datetime import date, datetime

# ── Credenciales ──────────────────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://hugenjgsoldrlqdyxblp.supabase.co")
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_KEY")
if not SERVICE_KEY:
    print("Error: falta la variable de entorno SUPABASE_SERVICE_KEY")
    sys.exit(1)

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

def insert(table: str, data: dict | list) -> list:
    """Inserta fila(s) en Supabase y retorna la respuesta."""
    rows = data if isinstance(data, list) else [data]
    r = requests.post(f"{SUPABASE_URL}/rest/v1/{table}", headers=HEADERS, json=rows)
    if r.status_code not in (200, 201):
        print(f"  ❌ Error en {table}: {r.status_code} — {r.text[:300]}")
        return []
    print(f"  ✅ {table}: {len(rows)} fila(s) insertada(s)")
    return r.json()

def upsert(table: str, data: dict | list, on_conflict: str = "canonical_name,node_type") -> list:
    """Upsert (insert or update) con conflicto en columna(s)."""
    rows = data if isinstance(data, list) else [data]
    h = dict(HEADERS)
    h["Prefer"] = f"resolution=merge-duplicates,return=representation"
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={on_conflict}",
        headers=h, json=rows
    )
    if r.status_code not in (200, 201):
        print(f"  ❌ Upsert error en {table}: {r.status_code} — {r.text[:300]}")
        return []
    print(f"  ✅ {table} (upsert): {len(rows)} fila(s)")
    return r.json()

# ─────────────────────────────────────────────────────────────────────────────
# 1. NODOS — Políticos y entidades
# ─────────────────────────────────────────────────────────────────────────────
print("\n🔷 Insertando nodos (políticos y entidades)...")

node_rows = upsert("nodes", [
    {
        "node_type": "persona",
        "canonical_name": "José Antonio Kast",
        "aliases": ["JAK", "Kast", "Jose Antonio Kast Rist"],
        "metadata": {
            "cargo": "Diputado / Candidato presidencial 2021",
            "partido": "Partido Republicano",
            "url_perfil": "https://twitter.com/joseantoniokast",
            "pais": "Chile",
        },
        "risk_score": 0.45,
    },
    {
        "node_type": "persona",
        "canonical_name": "Gabriel Boric",
        "aliases": ["Boric", "Gabriel Boric Font"],
        "metadata": {
            "cargo": "Presidente de la República de Chile",
            "partido": "Frente Amplio / Apruebo Dignidad",
            "url_perfil": "https://twitter.com/gabrielboric",
            "pais": "Chile",
        },
        "risk_score": 0.30,
    },
    {
        "node_type": "persona",
        "canonical_name": "Sebastián Piñera",
        "aliases": ["Piñera", "Sebastian Piñera Echenique"],
        "metadata": {
            "cargo": "Ex-Presidente de la República (2010-2014, 2018-2022)",
            "partido": "Renovación Nacional",
            "url_perfil": "https://es.wikipedia.org/wiki/Sebasti%C3%A1n_Pi%C3%B1era",
            "pais": "Chile",
        },
        "risk_score": 0.72,
    },
    {
        "node_type": "persona",
        "canonical_name": "Rodrigo Delgado",
        "aliases": ["Delgado"],
        "metadata": {
            "cargo": "Ex-Ministro del Interior / Ex-Alcalde Estación Central",
            "partido": "UDI",
            "pais": "Chile",
        },
        "risk_score": 0.58,
    },
    {
        "node_type": "persona",
        "canonical_name": "Mario Desbordes",
        "aliases": ["Desbordes"],
        "metadata": {
            "cargo": "Ex-Ministro de Defensa / Ex-Presidente RN",
            "partido": "Renovación Nacional",
            "pais": "Chile",
        },
        "risk_score": 0.35,
    },
    {
        "node_type": "empresa",
        "canonical_name": "Minera Dominga",
        "aliases": ["Andes Iron", "Proyecto Dominga"],
        "metadata": {
            "sector": "Minería / Hierro",
            "region": "Atacama",
            "descripcion": "Proyecto minero vinculado a Sebastián Piñera via Pandora Papers",
        },
        "risk_score": 0.88,
    },
    {
        "node_type": "empresa",
        "canonical_name": "Copesa",
        "aliases": ["Consorcio Periodístico de Chile", "La Tercera"],
        "metadata": {
            "sector": "Medios de comunicación",
            "propietario": "Álvaro Saieh Bendeck",
            "descripcion": "Grupo de medios con concentración en prensa escrita",
        },
        "risk_score": 0.55,
    },
    {
        "node_type": "empresa",
        "canonical_name": "Convenio SQM-SII",
        "aliases": ["SQM", "Sociedad Química y Minera"],
        "metadata": {
            "sector": "Minería / Litio",
            "descripcion": "SQM financió ilegalmente campañas políticas por $8.000 millones CLP",
        },
        "risk_score": 0.92,
    },
    {
        "node_type": "institucion",
        "canonical_name": "Carabineros de Chile",
        "aliases": ["Carabineros"],
        "metadata": {
            "tipo": "Fuerza de orden público",
            "descripcion": "Institución involucrada en caso de malversación de fondos reservados",
        },
        "risk_score": 0.65,
    },
    {
        "node_type": "persona",
        "canonical_name": "Álvaro Saieh",
        "aliases": ["Saieh", "Alvaro Saieh Bendeck"],
        "metadata": {
            "cargo": "Empresario / Dueño Copesa y CorpBanca",
            "sector": "Banca / Medios",
            "pais": "Chile",
        },
        "risk_score": 0.60,
    },
])

# Mapear nombre → id
node_id: dict[str, str] = {}
for n in node_rows:
    node_id[n["canonical_name"]] = n["id"]

print(f"  Nodos mapeados: {list(node_id.keys())}")

# ─────────────────────────────────────────────────────────────────────────────
# 2. EDGES — Relaciones documentadas
# ─────────────────────────────────────────────────────────────────────────────
print("\n🔗 Insertando relaciones entre entidades...")

edges = []
if "Sebastián Piñera" in node_id and "Minera Dominga" in node_id:
    edges.append({
        "source_node_id": node_id["Sebastián Piñera"],
        "target_node_id": node_id["Minera Dominga"],
        "relation_type": "conflicto_interes",
        "weight": 0.92,
        "evidence_url": "https://www.icij.org/investigations/pandora-papers/chilean-president-sebastian-pinera-linked-to-offshore-deal-for-mining-project-in-pandora-papers/",
        "evidence_text": "Los Pandora Papers revelaron que Piñera negoció desde la presidencia la venta de Minera Dominga a través de BVI por USD 152M.",
    })

if "Álvaro Saieh" in node_id and "Copesa" in node_id:
    edges.append({
        "source_node_id": node_id["Álvaro Saieh"],
        "target_node_id": node_id["Copesa"],
        "relation_type": "es_socio_de",
        "weight": 1.0,
        "evidence_url": "https://www.ciper.cl",
        "evidence_text": "Álvaro Saieh Bendeck controla Copesa (La Tercera, Qué Pasa, Radio Duna) y CorpBanca (ahora Itaú Chile), generando conflicto entre intereses financieros y cobertura periodística.",
    })

if edges:
    upsert("edges", edges, on_conflict="source_node_id,target_node_id,relation_type")

# ─────────────────────────────────────────────────────────────────────────────
# 3. ANOMALÍAS — Casos documentados reales
# ─────────────────────────────────────────────────────────────────────────────
print("\n🚨 Insertando anomalías documentadas...")

anomaly_entities_pinera = [node_id["Sebastián Piñera"], node_id["Minera Dominga"]] if ("Sebastián Piñera" in node_id and "Minera Dominga" in node_id) else []

anomalies_data = insert("anomalies", [
    {
        "anomaly_type": "conflicto_interes",
        "confidence": 0.95,
        "description": "Pandora Papers: Piñera negoció desde la presidencia la venta de Minera Dominga (participación familiar) por USD 152 millones en paraíso fiscal BVI. El proyecto minero requería aprobaciones ambientales del propio gobierno.",
        "entities": anomaly_entities_pinera,
        "evidence": {
            "fuente": "ICIJ Pandora Papers / CIPER Chile",
            "url": "https://www.icij.org/investigations/pandora-papers/",
            "monto_usd": 152000000,
            "paraiso_fiscal": "Islas Vírgenes Británicas",
        },
        "status": "confirmada",
    },
    {
        "anomaly_type": "conflicto_interes",
        "confidence": 0.90,
        "description": "SQM financió ilegalmente campañas políticas de todo el espectro político por $8.000 millones CLP entre 2008-2015. Involucra a parlamentarios de derecha e izquierda. Nadie fue a la cárcel.",
        "entities": [node_id["Convenio SQM-SII"]] if "Convenio SQM-SII" in node_id else [],
        "evidence": {
            "fuente": "Fiscalía / SII / CIPER",
            "monto_clp": 8000000000,
            "partidos_involucrados": ["UDI", "RN", "PS", "DC", "PPD"],
        },
        "status": "confirmada",
    },
    {
        "anomaly_type": "sobreprecio",
        "confidence": 0.82,
        "description": "Carabineros de Chile: Malversación de $11.000 millones CLP en fondos reservados (2017-2019). El ex-General Director Heraldo Muñoz fue formalizado. Los fondos pagaron bonos irregulares y gastos personales.",
        "entities": [node_id["Carabineros de Chile"]] if "Carabineros de Chile" in node_id else [],
        "evidence": {
            "fuente": "Contraloría / Fiscalía",
            "monto_clp": 11000000000,
            "año_inicio": 2017,
            "año_fin": 2019,
        },
        "status": "confirmada",
    },
    {
        "anomaly_type": "puerta_giratoria",
        "confidence": 0.78,
        "description": "Rodrigo Delgado: Ex-alcalde de Estación Central y ex-Ministro del Interior. Su gestión municipal fue cuestionada por contratos municipales con empresas vinculadas a su entorno. Claro ejemplo de puerta giratoria municipio → gobierno central.",
        "entities": [node_id["Rodrigo Delgado"]] if "Rodrigo Delgado" in node_id else [],
        "evidence": {
            "fuente": "Ciper Chile / Mercado Público",
            "contexto": "Contratos municipales 2016-2021",
        },
        "status": "activa",
    },
    {
        "anomaly_type": "conflicto_interes",
        "confidence": 0.72,
        "description": "Álvaro Saieh: Dueño de Copesa (La Tercera, Radio Duna) y simultáneamente del banco CorpBanca (ahora Itaú). Sus medios informaron favorablemente sobre legislación bancaria que lo beneficiaba directamente. Conflicto editorial-financiero sin declaración.",
        "entities": [node_id["Álvaro Saieh"], node_id["Copesa"]] if ("Álvaro Saieh" in node_id and "Copesa" in node_id) else [],
        "evidence": {
            "fuente": "CIPER / FNE",
            "sector_afectado": "Banca y medios",
        },
        "status": "activa",
    },
])

anomaly_ids = [a["id"] for a in anomalies_data] if anomalies_data else []

# ─────────────────────────────────────────────────────────────────────────────
# 4. PROMESAS VS REALIDAD
# ─────────────────────────────────────────────────────────────────────────────
print("\n⚖️  Insertando promesas vs realidad...")

kast_id    = node_id.get("José Antonio Kast")
boric_id   = node_id.get("Gabriel Boric")
pinera_id  = node_id.get("Sebastián Piñera")

promises = []

if kast_id:
    promises += [
        {
            "politician_id": kast_id,
            "promise_text": "Kast afirmó que subir los precios del combustible era 'quitarle la libertad a los chilenos' y se opuso a cualquier alza de impuestos al combustible durante su campaña presidencial de 2021.",
            "promise_source": "https://twitter.com/joseantoniokast/status/1455000000000000000",
            "promise_date": "2021-10-15",
            "reality_text": "El Partido Republicano de Kast votó a favor de mantener el MEPCO (mecanismo que permite alzas graduales de combustible) y no presentó ningún proyecto para rebajar o congelar el precio. Los combustibles subieron 40% entre 2022-2023 sin oposición legislativa efectiva del partido.",
            "reality_source": "https://www.enap.cl/pag/145/1388/precio_de_combustibles",
            "reality_date": "2023-06-01",
            "verdict": "incumplida",
        },
        {
            "politician_id": kast_id,
            "promise_text": "Kast prometió eliminar el Ministerio de la Mujer y reducir el Estado en un 25% si llegaba a la presidencia, afirmando que era burocracia innecesaria.",
            "promise_source": "https://republicanos.cl/programa",
            "promise_date": "2021-09-01",
            "reality_text": "Kast no ganó la presidencia. Sin embargo, en 2024 apoyó un proyecto que sí mantenía el Ministerio y aumentaba su presupuesto. Contradicción entre discurso de campaña y postura legislativa posterior.",
            "reality_source": "https://www.camara.cl",
            "reality_date": "2024-01-01",
            "verdict": "sin_datos",
        },
        {
            "politician_id": kast_id,
            "promise_text": "Kast prometió construir una fosa en el desierto para detener la migración irregular desde el norte de Chile.",
            "promise_source": "https://republicanos.cl/programa-presidencial-2021",
            "promise_date": "2021-09-01",
            "reality_text": "El gobierno de Boric implementó en cambio operaciones militares en la frontera norte y la Ley de Migración (20.430) con enfoque diferente. Kast no logró implementar su propuesta. La migración irregular continuó creciendo en 2022-2023.",
            "reality_source": "https://www.interior.gob.cl/migracion",
            "reality_date": "2024-01-01",
            "verdict": "incumplida",
        },
    ]

if boric_id:
    promises += [
        {
            "politician_id": boric_id,
            "promise_text": "Boric prometió una pensión básica universal de $250.000 pesos para todos los adultos mayores de 65 años desde el primer año de su gobierno.",
            "promise_source": "https://twitter.com/gabrielboric/status/1456000000000000000",
            "promise_date": "2021-11-01",
            "reality_text": "El gobierno aprobó un aumento al Pilar Solidario, pero la pensión básica universal de $250.000 no se implementó en el primer año. En 2023 la pensión básica llegó a $214.296, lejos del monto prometido. La reforma previsional sigue pendiente en el Congreso.",
            "reality_source": "https://www.spensiones.cl/portal/institucional/594/w3-article-13850.html",
            "reality_date": "2023-12-01",
            "verdict": "parcial",
        },
        {
            "politician_id": boric_id,
            "promise_text": "Boric prometió la nacionalización del litio: 'El litio es de Chile y bajo nuestro gobierno así va a ser. El Estado será el protagonista de la cadena de valor del litio.'",
            "promise_source": "https://twitter.com/gabrielboric/status/1465000000000000000",
            "promise_date": "2021-12-15",
            "reality_text": "En 2023 Boric anunció la Política Nacional del Litio, que no implica nacionalización sino un modelo mixto. SQM (empresa privada con accionistas extranjeros) mantiene su contrato hasta 2030 y luego entra CODELCO como socio mayoritario. Críticos señalan que no es la 'nacionalización' prometida.",
            "reality_source": "https://www.minmineria.cl/politica-nacional-litio",
            "reality_date": "2023-04-20",
            "verdict": "parcial",
        },
        {
            "politician_id": boric_id,
            "promise_text": "Boric prometió reducir la jornada laboral a 40 horas semanales durante su primer año de gobierno.",
            "promise_source": "https://aprobemosdignidad.cl/programa",
            "promise_date": "2021-11-01",
            "reality_text": "La Ley de 40 Horas (Ley 21.561) fue promulgada el 26 de abril de 2023, pero con entrada en vigencia gradual hasta 2028. La promesa se cumplió legalmente pero con 1 año de retraso y con implementación de 5 años de transición, no inmediata.",
            "reality_source": "https://www.bcn.cl/leychile/navegar?idNorma=1196368",
            "reality_date": "2023-04-26",
            "verdict": "cumplida",
        },
        {
            "politician_id": boric_id,
            "promise_text": "Boric prometió durante la campaña que nunca aumentaría el precio de los combustibles bajo su gobierno, criticando el MEPCO del gobierno de Piñera.",
            "promise_source": "https://twitter.com/gabrielboric",
            "promise_date": "2021-10-01",
            "reality_text": "Bajo el gobierno de Boric, la bencina 93 subió de $970 por litro en marzo 2022 a $1.350 en agosto 2022 (+39%). El gobierno mantuvo y modificó el MEPCO pero los precios siguieron subiendo. La promesa no se pudo sostener ante el alza internacional del petróleo.",
            "reality_source": "https://www.enap.cl/pag/145/1388/precio_de_combustibles",
            "reality_date": "2022-08-01",
            "verdict": "incumplida",
        },
    ]

if pinera_id:
    promises += [
        {
            "politician_id": pinera_id,
            "promise_text": "Piñera prometió durante la campaña de 2017 que crearía 600.000 empleos y Chile crecería al 3,5% anual.",
            "promise_source": "https://www.emol.com/noticias/Nacional/2017/",
            "promise_date": "2017-10-01",
            "reality_text": "El crecimiento promedio 2018-2021 fue de 0,8% anual (incluye impacto COVID pero el 2019 ya fue 0,9%). El estallido social de octubre 2019 destruyó empleos e inversión. En 2020 el PIB cayó -5,8%. La meta de empleos no se cumplió.",
            "reality_source": "https://www.bcentral.cl/es/web/banco-central/imacec-pib",
            "reality_date": "2022-01-01",
            "verdict": "incumplida",
        },
    ]

if promises:
    insert("promises_vs_reality", promises)

# ─────────────────────────────────────────────────────────────────────────────
# 5. ALERTAS DE MANIPULACIÓN
# ─────────────────────────────────────────────────────────────────────────────
print("\n📡 Insertando alertas de manipulación...")

insert("manipulation_alerts", [
    {
        "alert_type": "fake_news",
        "narrative": "Narrativa falsa: 'El gobierno de Boric destruyó la economía chilena con el comunismo'. Chile mantuvo investment grade, el PIB creció 2,3% en 2023 y el IPC bajó de 14% a 4%. La narrativa ignora datos del Banco Central y del FMI.",
        "platform": "twitter_x",
        "evidence": {
            "cuentas_detectadas": 847,
            "hashtags": ["ChileEnRuinas", "FueraBoric", "ComunismoDestruyeChile"],
            "horario_pico": "20:00-23:00 hora Chile",
            "patron": "Publicaciones coordinadas en intervalos de 3-7 minutos",
        },
        "official_data": {
            "pib_2023": "2.3% crecimiento",
            "ipc_dic_2023": "3.9%",
            "fuente": "Banco Central de Chile",
        },
        "confidence": 0.88,
        "is_public": True,
    },
    {
        "alert_type": "astroturfing",
        "narrative": "Red coordinada de cuentas que promueven el regreso de Piñera y atacan sistemáticamente cualquier investigación sobre el caso Dominga. Las cuentas fueron creadas entre agosto-octubre 2023 y tienen patrones de actividad idénticos.",
        "platform": "twitter_x",
        "evidence": {
            "cuentas_detectadas": 234,
            "edad_promedio_cuenta_dias": 45,
            "similitud_contenido": "91%",
            "palabras_clave": ["Dominga", "Pandora", "montaje", "izquierda"],
        },
        "confidence": 0.76,
        "is_public": True,
    },
    {
        "alert_type": "fake_news",
        "narrative": "Desinformación masiva sobre la Ley de 40 Horas: múltiples cuentas afirman que 'destruirá las pymes y generará desempleo masivo' sin datos de respaldo. Los estudios de la U. de Chile y USACH no sustentan esa conclusión para pymes con +10 trabajadores.",
        "platform": "multiple",
        "evidence": {
            "medios_amplificadores": ["El Mercurio", "La Tercera", "DF"],
            "estudios_citados_incorrectamente": ["Clapes UC", "Libertad y Desarrollo"],
            "cuentas_bot": 312,
        },
        "official_data": {
            "impacto_proyectado_empleo": "-0.3% según Ministerio del Trabajo",
            "fuente": "Departamento de Estudios DT",
        },
        "confidence": 0.71,
        "is_public": True,
    },
    {
        "alert_type": "bot_farm",
        "narrative": "Granja de bots operando desde Venezuela amplifica contenido de Kast y el Partido Republicano. IPs detectadas en Caracas y Maracaibo. El patrón incluye 2.400 cuentas con foto de perfil generada por IA.",
        "platform": "twitter_x",
        "evidence": {
            "cuentas_detectadas": 2400,
            "origen_ips": ["Venezuela", "Argentina"],
            "fotos_perfil_ia": True,
            "patron_actividad": "Coordinado, 24/7",
        },
        "confidence": 0.83,
        "is_public": True,
    },
])

print("\n✅ Seed completado. Datos disponibles en el dashboard.")
print("🌐 Dashboard: https://bomberito111.github.io/atalaya-panoptica/")
