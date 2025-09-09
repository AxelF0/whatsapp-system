# app/services/ia_service.py
# ---------------------------------------------------------------------
# Retrieval-then-Generation service:
# - Cosine similarity (IndexFlatIP) with normalized embeddings
# - Returns guidance when no chunk passes threshold
# - Includes lightweight system instruction to avoid hallucinations
# - Exposes helpers for debug (/debug/search, /debug/health)
# ---------------------------------------------------------------------

import re
import os
import json
import time
import faiss
import pickle
import numpy as np
import requests
from collections import defaultdict, Counter
from typing import List, Optional, Tuple, Dict, Iterable
from sentence_transformers import SentenceTransformer

# Optional: load environment if not done elsewhere
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

# --- Config from .env (with sensible defaults) -----------------------
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "distiluse-base-multilingual-cased-v1")
INDEX_FILE = os.getenv("VECTOR_DB_INDEX", "data/vector_db/index.faiss")
DOC_FILE = os.getenv("VECTOR_DB_DOCS", "data/vector_db/docs.pkl")

OLLAMA_API_URL = os.getenv("OLLAMA_API_URL", "http://localhost:11434/api/generate")
OLLAMA_MODEL_NAME = os.getenv("OLLAMA_MODEL_NAME", "phi")
REQUEST_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT_SEC", "10"))  # Phi es más rápido que Mistral

TOP_K = int(os.getenv("TOP_K", "4"))
MIN_SIM_THRESHOLD = float(os.getenv("MIN_SIM_THRESHOLD", "0.32"))

# --- System instruction to enforce RAG discipline --------------------
SYSTEM_INSTRUCTION = """
Eres un asistente inmobiliario de REMAXI. Responde SOLO basándote en la información disponible.

REGLAS ESTRICTAS:
1. NUNCA inventes propiedades, precios o ubicaciones
2. Si NO tienes información específica de propiedades, responde: "No tengo información específica sobre propiedades en esa zona. Te conectaré con un agente especializado que puede ayudarte mejor."
3. SOLO menciona propiedades que aparezcan en el contexto proporcionado
4. Si el contexto está vacío, NO inventes información

CUANDO SÍ TIENES INFORMACIÓN:
- Menciona propiedades específicas con precios reales
- Incluye ubicación exacta y características
- Proporciona datos del agente responsable

CUANDO NO TIENES INFORMACIÓN:
- Admite que no tienes datos específicos
- Ofrece conectar con un agente

Mantén un tono amigable pero NUNCA inventes información.
""".strip()

# --- Singleton pattern para cache del modelo -----------------
_MODEL_CACHE: Optional[SentenceTransformer] = None

# --- Cache de respuestas de IA (en memoria) ------------------
import hashlib
_RESPONSE_CACHE = {}
RESPONSE_CACHE_TIMEOUT = 10 * 60 * 1000  # 10 minutos - Balance RAG vs Performance

# --- Integración con Base de Datos DESHABILITADA ---------------------------
# La BD debe estar vectorizada en los archivos FAISS, no consultada en tiempo real
DB_INTEGRATION_ENABLED = False

def get_embedding_model() -> SentenceTransformer:
    """Get cached embedding model (singleton pattern)"""
    global _MODEL_CACHE
    if _MODEL_CACHE is None:
        print(f"Cargando modelo de embeddings IA: {EMBEDDING_MODEL_NAME}")
        _MODEL_CACHE = SentenceTransformer(EMBEDDING_MODEL_NAME)
        print("Modelo de embeddings IA cargado en cache")
    return _MODEL_CACHE

def _normalize(v: np.ndarray) -> np.ndarray:
    """L2-normalize embeddings to use cosine similarity via inner product."""
    norms = np.linalg.norm(v, axis=1, keepdims=True) + 1e-12
    return v / norms

def _load_index_and_docs():
    """Load FAISS index and docs metadata from disk."""
    if not (os.path.exists(INDEX_FILE) and os.path.exists(DOC_FILE)):
        return None, None, None
    index = faiss.read_index(INDEX_FILE)
    with open(DOC_FILE, "rb") as f:
        docs = pickle.load(f)  # Expected: List[dict] with {"text": str, "meta": {...}}
    dim = index.d
    return index, docs, dim

_INDEX, _DOCS, _DIM = _load_index_and_docs()

def _ensure_ready() -> bool:
    """Check that model, index, and docs are available."""
    return _INDEX is not None and _DOCS is not None and _DIM is not None

# ---------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------

def get_index_overview(max_topics: int = 8) -> Dict:
    """
    Summarize what's in the vector DB to guide the user:
    - total chunks
    - unique pdf list
    - top (pdf, title) pairs by frequency
    """
    if not (_DOCS and isinstance(_DOCS, list)):
        return {"total_chunks": 0, "pdfs": [], "top_topics": []}

    from collections import Counter

    pdfs: List[str] = []
    topics = Counter()

    for d in _DOCS:
        if not isinstance(d, dict):
            continue
        meta = d.get("meta", {}) or {}
        pdf = meta.get("pdf")
        title = meta.get("title")
        if pdf:
            pdfs.append(pdf)
        if pdf and title:
            topics[(pdf, title)] += 1

    # Preserve first-seen order for PDFs
    seen = set()
    uniq_pdfs = []
    for p in pdfs:
        if p not in seen:
            seen.add(p)
            uniq_pdfs.append(p)

    top_topics = [{"pdf": pdf, "title": title} for (pdf, title), _ in topics.most_common(max_topics)]

    return {
        "total_chunks": len(_DOCS),
        "pdfs": uniq_pdfs,
        "top_topics": top_topics
    }

def build_guidance_reply(user_query: str, max_examples: int = 6) -> str:
    """
    Build a friendly guidance message suggesting real topics found in the PDFs.
    """
    ov = get_index_overview(max_examples)
    if ov["total_chunks"] == 0:
        return (
            "¡Hola! Soy el asistente de Remaxi, inmobiliaria de venta y alquiler de propiedades.\n"
            "Aún no tengo documentos cargados sobre propiedades disponibles.\n"
            "Carga documentos y pregúntame sobre propiedades en venta o alquiler, precios y ubicaciones."
        )

    bullets = []
    for t in ov["top_topics"]:
        pdf = t.get("pdf", "documento.pdf")
        title = (t.get("title") or "").strip()
        if title:
            bullets.append(f"• {title} — ({pdf})")

    examples = "\n".join(bullets) if bullets else "• Consulta por secciones y conceptos clave presentes en tus PDFs."

    return (
        "No encontré información suficiente sobre esa consulta de propiedades.\n\n"
        "Para obtener mejores resultados, pregunta sobre propiedades en venta o alquiler presentes en los documentos. "
        "Por ejemplo:\n"
        f"{examples}\n\n"
        "También puedes ser más específico: \"¿Qué propiedades hay en venta en [zona]?\" o \"¿Cuáles son los precios de alquiler en [documento]?\""
    )

def get_relevant_chunks(query: str, top_k: int = TOP_K) -> Optional[List[Tuple[str, float, Dict]]]:
    """
    Query FAISS vectorial database and return a list of (chunk_text, similarity, meta).
    Only returns items with similarity >= MIN_SIM_THRESHOLD.
    """
    if not _ensure_ready():
        return None
    
    model = get_embedding_model()
    q = model.encode([query], convert_to_numpy=True)
    q = _normalize(q)
    sims, idxs = _INDEX.search(q, top_k)

    sims = sims[0]
    idxs = idxs[0]

    chunks = []
    for j, i in enumerate(idxs):
        if i < 0:
            continue
        d = _DOCS[i]
        text = d["text"] if isinstance(d, dict) else str(d)
        meta = d.get("meta", {}) if isinstance(d, dict) else {}
        sim = float(sims[j])
        if sim >= MIN_SIM_THRESHOLD:
            chunks.append((text, sim, meta))
    
    return chunks if chunks else None

def _build_prompt(query: str, context_chunks: List[Tuple[str, float, Dict]], history: str = "") -> str:
    """
    Build the final prompt: system instruction + (optional) chat history + RAG context.
    """
    # Truncate each chunk for safety; keep useful content
    context_str = "\n\n".join([
        f"- [{(m or {}).get('pdf','?')} p.{(m or {}).get('page_start','?')}] {c[:1000]}"
        for c, _, m in context_chunks
    ])

    base = f"{SYSTEM_INSTRUCTION}\n\n"
    if history.strip():
        base += (
            "Historial (para tono/continuidad, NO como fuente autoritativa):\n"
            f"{history.strip()}\n\n"
        )

    base += f"Contexto (fragmentos relevantes):\n{context_str}\n\n"

    # 🔒 Anti‑alucinación extra: reglas explícitas antes de la pregunta
    base += (
        "Reglas finales:\n"
        "- Si no estás 100% seguro por el contexto, dilo claramente.\n"
        "- No inventes páginas ni citas si no aparecen en el contexto.\n"
        "- Si el contexto es ambiguo o insuficiente, pide una reformulación enfocada en secciones/títulos del PDF.\n\n"
    )

    base += f"Pregunta: {query}\nRespuesta:"
    return base

def _generate_friendly_response(query: str) -> str:
    """
    Generar respuesta amigable para consultas sin contexto RAG específico.
    Útil para saludos y consultas generales.
    """
    query_lower = query.lower().strip()
    
    # Detectar saludos
    greetings = ['hola', 'buenos dias', 'buenas tardes', 'buenas noches', 'saludos', 'hi', 'hello']
    if any(greeting in query_lower for greeting in greetings):
        return "¡Hola! 👋 Soy tu asistente inmobiliario de REMAXI. Estoy aquí para ayudarte con información sobre propiedades, precios, ubicaciones y todo lo relacionado con bienes raíces. ¿En qué puedo asistirte hoy?"
    
    # Detectar agradecimientos
    thanks = ['gracias', 'thank you', 'thanks']
    if any(thank in query_lower for thank in thanks):
        return "¡De nada! 😊 Estoy aquí para ayudarte con cualquier consulta inmobiliaria que tengas. No dudes en preguntarme sobre propiedades, precios o ubicaciones."
    
    # Respuesta general para otras consultas sin contexto
    return "Soy tu asistente inmobiliario de REMAXI. Aunque no tengo información específica sobre tu consulta en mi base de datos actual, estaré encantado de conectarte con uno de nuestros agentes especializados que podrá brindarte información detallada. ¿Te gustaría que coordine una llamada?"

def _get_query_hash(query: str, history: str = "") -> str:
    """Generate hash for caching based on query and history - SOLO para consultas similares"""
    # Normalizar consulta para mejor matching
    normalized = query.strip().lower()
    # Remover artículos y palabras comunes para mejor agrupación
    normalized = normalized.replace('que ', '').replace('cual ', '').replace('como ', '').replace('donde ', '')
    combined = f"{normalized}||{history.strip()}"
    return hashlib.md5(combined.encode('utf-8')).hexdigest()

def _get_cached_response(query_hash: str) -> Optional[dict]:
    """Get cached response if not expired"""
    if query_hash not in _RESPONSE_CACHE:
        return None
    
    cached = _RESPONSE_CACHE[query_hash]
    if (cached["timestamp"] + RESPONSE_CACHE_TIMEOUT) < (time.time() * 1000):
        # Expired, remove from cache
        del _RESPONSE_CACHE[query_hash]
        return None
    
    return cached["response"]

def _cache_response(query_hash: str, response: dict):
    """Cache response with timestamp"""
    _RESPONSE_CACHE[query_hash] = {
        "response": response,
        "timestamp": time.time() * 1000
    }

def _warm_up_ollama():
    """Calentar Ollama con una consulta simple para cargar el modelo en memoria"""
    try:
        print("Warming up Ollama...")
        payload = {
            "model": OLLAMA_MODEL_NAME,
            "prompt": "Hola",
            "stream": False,
            "options": {"num_predict": 5}
        }
        resp = requests.post(OLLAMA_API_URL, json=payload, timeout=30)
        if resp.status_code == 200:
            print(f"Ollama warm-up completado con modelo {OLLAMA_MODEL_NAME}")
        else:
            print(f"Ollama warm-up fallo: {resp.status_code}")
    except Exception as e:
        print(f"Ollama warm-up error: {e}")

# Warm-up automático al cargar el módulo
_warm_up_ollama()

def ask_mistral_with_context(query: str, history: str = "") -> dict:
    """
    Retrieve-then-generate WITH CACHE:
    - Check cache first for identical queries
    - If no relevant context above threshold, generate friendly greeting response.
    - Else, send prompt with system instruction + context to Ollama.
    """
    print(f"🔍 IA Query: '{query[:60]}...'")
    
    # 1. Check cache first
    query_hash = _get_query_hash(query, history)
    cached = _get_cached_response(query_hash)
    if cached:
        print(f"⚡ Respuesta IA desde CACHE para: {query[:50]}...")
        return {**cached, "from_cache": True}
    # 2. Process query normally
    chunks = get_relevant_chunks(query)
    print(f"🔍 Chunks encontrados: {len(chunks) if chunks else 0}")
    
    if not chunks:
        # Sin contexto RAG relevante - usar respuesta estricta
        print("⚠️ Sin contexto relevante encontrado")
        response = {
            "question": query, 
            "answer": "No tengo información específica sobre propiedades en esa zona. Te conectaré con un agente especializado que puede ayudarte mejor.", 
            "used_context": False
        }
        # Cache simple responses too
        _cache_response(query_hash, response)
        return response
    
    # Log de chunks encontrados
    for i, (text, sim, meta) in enumerate(chunks[:2]):
        source = meta.get('source_type', meta.get('pdf', 'unknown'))
        print(f"📄 Chunk {i+1}: {source} (sim: {sim:.3f}) - {text[:80]}...")

    prompt = _build_prompt(query, chunks, history)

    try:
        # Configuración optimizada para WhatsApp: Respuestas RÁPIDAS
        payload = {
            "model": OLLAMA_MODEL_NAME, 
            "prompt": prompt, 
            "stream": False,
            "options": {
                "temperature": 0.2,     # Más determinista = más rápido
                "top_k": 10,           # Menos opciones = más rápido
                "top_p": 0.7,          # Enfoque en opciones más probables
                "repeat_penalty": 1.1,
                "num_predict": 200,    # Limitar tokens de respuesta
                "num_ctx": 1024,       # Contexto reducido para acelerar
                "stop": ["\n\n\n"]     # Parar en párrafos largos
            }
        }
        
        resp = requests.post(
            OLLAMA_API_URL,
            json=payload,
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            return {
                "question": query,
                "answer": "No se pudo obtener una respuesta del modelo.",
                "used_context": False,
            }
        data = resp.json()
        answer = data.get("response", "").strip()
        
        # Cache successful response
        response = {"question": query, "answer": answer, "used_context": True}
        _cache_response(query_hash, response)
        
    except requests.RequestException:
        # Don't cache error responses
        return {"question": query, "answer": "Error de conexión con el modelo de IA.", "used_context": False}

    return response

def summarize_corpus(max_items: int = 8) -> dict:
    """
    Return a safe snapshot of the corpus based on metadata only.
    {
      "total_chunks": int,
      "pdfs": [{"name": "...", "chunks": N}],
      "top_titles": [{"pdf": "...", "title": "...", "count": N}]
    }
    """
    if not (_DOCS and isinstance(_DOCS, list)):
        return {"total_chunks": 0, "pdfs": [], "top_titles": []}

    # count chunks per pdf
    by_pdf = Counter()
    title_pairs = Counter()
    for d in _DOCS:
        meta = (d.get("meta") or {}) if isinstance(d, dict) else {}
        pdf  = meta.get("pdf")
        tit  = meta.get("title")
        if pdf:
            by_pdf[pdf] += 1
        if pdf and tit:
            title_pairs[(pdf, tit.strip())] += 1

    pdfs = [{"name": p, "chunks": c} for p, c in by_pdf.most_common()]
    top_titles = [{"pdf": p, "title": t, "count": c} for (p, t), c in title_pairs.most_common(max_items)]

    return {
        "total_chunks": len(_DOCS),
        "pdfs": pdfs,
        "top_titles": top_titles
    }

def summarize_pdf(pdf_name: str, max_titles: int = 12) -> dict:
    """
    Safe per-PDF overview built from metadata only.
    {
      "pdf": "name.pdf",
      "titles": [{"title":"...", "count": N}],
      "pages_hint": [10, 11, 12] (optional, only if known)
    }
    """
    if not (_DOCS and isinstance(_DOCS, list)):
        return {"pdf": pdf_name, "titles": []}

    title_counter = Counter()
    pages = set()
    for d in _DOCS:
        if not isinstance(d, dict):
            continue
        meta = d.get("meta") or {}
        if meta.get("pdf") == pdf_name:
            title = (meta.get("title") or "").strip()
            if title:
                title_counter[title] += 1
            if isinstance(meta.get("page_start"), int):
                pages.add(meta["page_start"])

    titles = [{"title": t, "count": c} for t, c in title_counter.most_common(max_titles)]
    pages_hint = sorted(list(pages))[:50]  # opcional, evita listas enormes

    return {"pdf": pdf_name, "titles": titles, "pages_hint": pages_hint}

def get_top_candidates(query: str, top_k: int = 6):
    """
    Return top-k nearest chunks by cosine similarity (NO threshold).
    Use only for guidance/suggestions, not as authoritative context.
    Returns list of (text, sim, meta) sorted by sim desc.
    """
    if not _ensure_ready():
        return []
    model = get_embedding_model()
    q = model.encode([query], convert_to_numpy=True)
    q = _normalize(q)
    sims, idxs = _INDEX.search(q, top_k)
    sims = sims[0]; idxs = idxs[0]
    out = []
    for j, i in enumerate(idxs):
        if i < 0:
            continue
        d = _DOCS[i]
        text = d["text"] if isinstance(d, dict) else str(d)
        meta = d.get("meta", {}) if isinstance(d, dict) else {}
        out.append((text, float(sims[j]), meta))
    # highest similarity first
    out.sort(key=lambda x: x[1], reverse=True)
    return out

def _uniq_keep_order(items: Iterable):
    seen = set()
    ordered = []
    for it in items:
        if it not in seen:
            seen.add(it)
            ordered.append(it)
    return ordered

def suggest_topics_for(query: str, max_topics: int = 6):
    """
    Suggest (pdf, title) pairs related to the user's query using nearest neighbors
    (without threshold). Deduplicate and keep best-first order.
    """
    cand = get_top_candidates(query, top_k=max_topics * 3)
    pairs = []
    for _, sim, meta in cand:
        pdf = (meta or {}).get("pdf")
        title = (meta or {}).get("title")
        if pdf and title:
            # Store with sim for later sort
            pairs.append(((pdf, title), sim))
    # sort by best sim, then de-dup
    pairs.sort(key=lambda x: x[1], reverse=True)
    ordered = _uniq_keep_order([p for (p, _) in pairs])
    return ordered[:max_topics]

def get_suggested_titles(user_query: str, max_suggestions: int = 5) -> list[str]:
    """
    Return a small, de-duplicated list of titles to suggest to the user,
    prioritizing nearest neighbors; fallback to top topics from the corpus overview.
    """
    pairs = suggest_topics_for(user_query, max_topics=max_suggestions)
    titles = [t for (_pdf, t) in pairs if t]

    if not titles:
        ov = get_index_overview(max_topics=max_suggestions)
        titles = [ (x.get("title") or "").strip() for x in ov.get("top_topics", []) if x.get("title") ]

    # de-dup keeping order
    seen, ordered = set(), []
    for t in titles:
        if t not in seen:
            seen.add(t)
            ordered.append(t)
    return ordered[:max_suggestions]

def format_topics_inline(titles: list[str], max_items: int = 5) -> str:
    """
    Natural inline list: A, B, C y D (sin nombres de PDF, sin tecnicismos).
    """
    titles = [t.strip() for t in titles if t and t.strip()]
    titles = titles[:max_items]
    if not titles:
        return ""
    if len(titles) == 1:
        return titles[0]
    return ", ".join(titles[:-1]) + " y " + titles[-1]

def build_softgrounded_reply(user_query: str, max_suggestions: int = 5, natural: bool = True) -> str:
    """
    Natural guidance reply:
    - Does NOT mention missing context.
    - Gently explains role and proposes concrete topics from nearest neighbors (no PDF names).
    - Still grounded to corpus by suggesting real titles found in FAISS metadata.
    """
    ov = get_index_overview(max_topics=max_suggestions)
    suggestions = suggest_topics_for(user_query, max_topics=max_suggestions)

    # Build a list of titles (prefer nearest-neighbor titles; fallback to top_topics)
    titles = [title for (_pdf, title) in suggestions]
    if not titles:
        titles = [t.get("title", "") for t in ov.get("top_topics", [])]

    topics_line = format_topics_inline(titles, max_items=max_suggestions)

    if not ov["total_chunks"]:
        # No docs indexed at all → keep it warm and actionable
        return (
            "Soy el asistente de Remaxi, inmobiliaria especializada en venta y alquiler. "
            "Puedo ayudarte con consultas sobre propiedades, pero aún no hay material cargado."
        )

    if natural:
        # Natural tone: no “contexto insuficiente”
        if topics_line:
            return (
                "Soy el asistente de Remaxi, inmobiliaria de venta y alquiler. "
                f"Puedo ayudarte con información sobre: {topics_line}. "
                "¿Sobre qué propiedad en venta o alquiler te gustaría saber más?"
            )
        else:
            return (
                "Soy el asistente de Remaxi, inmobiliaria de venta y alquiler. "
                "Pregúntame sobre propiedades específicas, ubicaciones, precios de venta o alquiler."
            )

    # Legacy/explicit version (kept for compatibility if ever needed)
    bullets = "\n".join([f"• {t}" for t in titles[:max_suggestions] if t])
    return (
        "Soy el asistente de Remaxi, inmobiliaria de venta y alquiler, y respondo con base a la información que poseo. "
        "Para avanzar, prueba con preguntas sobre propiedades en venta o alquiler enfocados en:\n"
        f"{bullets}\n\n"
        "Si me das una ubicación específica o tipo de propiedad, puedo ser más preciso."
    )