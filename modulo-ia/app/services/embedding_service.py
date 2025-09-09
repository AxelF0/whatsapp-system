# app/services/embedding_service.py

import os
import faiss
import fitz
import pickle
import numpy as np
import psycopg2
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Optional
from docx import Document
from datetime import datetime

from app.services.text_preprocess import (
    looks_like_toc_or_cover,
    remove_headers_footers,
    normalize_spaces,
    chunk_title_aware,
    basic_deduplicate,
)

EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "distiluse-base-multilingual-cased-v1")
INDEX_FILE = os.getenv("VECTOR_DB_INDEX", "data/vector_db/index.faiss")
DOC_FILE = os.getenv("VECTOR_DB_DOCS", "data/vector_db/docs.pkl")

# Singleton pattern para cache del modelo
_MODEL_CACHE = None

def get_embedding_model():
    """Get cached embedding model (singleton pattern)"""
    global _MODEL_CACHE
    if _MODEL_CACHE is None:
        print(f"Cargando modelo de embeddings: {EMBEDDING_MODEL_NAME}")
        _MODEL_CACHE = SentenceTransformer(EMBEDDING_MODEL_NAME)
        print("Modelo de embeddings cargado en cache")
    return _MODEL_CACHE

def _normalize(v: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(v, axis=1, keepdims=True) + 1e-12
    return v / norms

def _load_or_create_ip_index(dim: int) -> faiss.IndexFlatIP:
    if os.path.exists(INDEX_FILE):
        idx = faiss.read_index(INDEX_FILE)
        if not isinstance(idx, faiss.IndexFlatIP):
            raise ValueError("Existing FAISS index is not IndexFlatIP.")
        if idx.d != dim:
            raise ValueError(f"FAISS dim mismatch. Expected {dim}, got {idx.d}.")
        return idx
    return faiss.IndexFlatIP(dim)

def _read_pdf_pages(pdf_path: str) -> List[str]:
    pages = []
    with fitz.open(pdf_path) as doc:
        for page in doc:
            pages.append(page.get_text())
    return pages

def _read_word_document(docx_path: str) -> str:
    """Extract text content from Word document"""
    try:
        doc = Document(docx_path)
        full_text = []
        for paragraph in doc.paragraphs:
            if paragraph.text.strip():
                full_text.append(paragraph.text)
        return "\n".join(full_text)
    except Exception as e:
        print(f"Error reading Word document {docx_path}: {e}")
        return ""

def _get_database_properties() -> List[Dict]:
    """Extract properties from PostgreSQL database for vectorization"""
    try:
        # Load environment variables
        try:
            from dotenv import load_dotenv
            load_dotenv()
        except ImportError:
            pass
        
        db_config = {
            'host': os.getenv('DB_HOST', 'localhost'),
            'port': os.getenv('DB_PORT', '5432'),
            'database': os.getenv('DB_NAME', 'dbremax'),
            'user': os.getenv('DB_USER', 'postgres'),
            'password': os.getenv('DB_PASSWORD', 'postgre')
        }
        
        conn = psycopg2.connect(**db_config)
        cursor = conn.cursor()
        
        # Query to get all property information
        query = """
            SELECT 
                p.id,
                p.nombre_propiedad,
                tp.nombre as tipo_propiedad,
                p.descripcion,
                p.ubicacion,
                COALESCE(p.precio_venta, p.precio_alquiler) as precio,
                to_op.nombre as tipo_operacion,
                ep.nombre as estado_propiedad,
                p.superficie,
                p.dimensiones,
                u.nombre || ' ' || u.apellido as agente,
                u.telefono as telefono_agente
            FROM Propiedad p
            INNER JOIN TipoPropiedad tp ON p.tipo_propiedad_id = tp.id
            INNER JOIN EstadoPropiedad ep ON p.estado_propiedad_id = ep.id
            INNER JOIN TipoOperacion to_op ON p.tipo_operacion_id = to_op.id
            INNER JOIN Usuario u ON p.usuario_id = u.id
            WHERE p.estado = 1
            ORDER BY p.id
        """
        
        cursor.execute(query)
        results = cursor.fetchall()
        cursor.close()
        conn.close()
        
        properties = []
        for row in results:
            prop_id, nombre, tipo, descripcion, ubicacion, precio, operacion, estado, superficie, dimensiones, agente, telefono = row
            
            # Create comprehensive text for vectorization
            precio_str = f"${float(precio):,.0f}" if precio else "Precio por consultar"
            
            full_text = f"""
PROPIEDAD REMAXI #{prop_id}: {nombre or f'Propiedad {prop_id}'}

INFORMACIÓN BÁSICA:
- Tipo: {tipo} para {operacion}
- Estado: {estado}
- Ubicación: {ubicacion}
- Precio: {precio_str}
- Superficie: {superficie or 'No especificada'}
- Dimensiones: {dimensiones or 'No especificadas'}

DESCRIPCIÓN:
{descripcion or 'Sin descripción disponible'}

CONTACTO:
- Agente responsable: {agente}
- Teléfono: {telefono}

PALABRAS CLAVE:
{tipo.lower()}, {operacion.lower()}, {ubicacion.lower()}, propiedad, inmobiliaria, remaxi, {nombre.lower() if nombre else ''}
            """.strip()
            
            properties.append({
                'text': full_text,
                'meta': {
                    'source_type': 'database',
                    'property_id': prop_id,
                    'nombre': nombre,
                    'tipo': tipo,
                    'ubicacion': ubicacion,
                    'precio': float(precio) if precio else 0,
                    'operacion': operacion,
                    'estado': estado,
                    'agente': agente,
                    'telefono': telefono,
                    'pdf': f'BD_Propiedad_{prop_id}',  # For compatibility with existing system
                    'title': f'{tipo} en {ubicacion}',
                    'page_start': 1
                }
            })
        
        print(f"Extraidas {len(properties)} propiedades de BD")
        return properties
        
    except Exception as e:
        print(f"Error extrayendo propiedades de BD: {e}")
        return []

def build_vector_index_from_file(file_path: str, max_chars: int = 1000, overlap: int = 180):
    """Process a single document file (PDF or Word) and add to vector index"""
    file_name = os.path.basename(file_path)
    file_ext = os.path.splitext(file_path)[1].lower()
    
    chunk_objs: List[dict] = []
    
    if file_ext == '.pdf':
        raw_pages = _read_pdf_pages(file_path)
        
        # 1) Remove headers/footers
        cleaned_pages = remove_headers_footers([normalize_spaces(p) for p in raw_pages])
        
        # 2) Filter TOC/cover-like pages
        useful_pages = []
        for i, p in enumerate(cleaned_pages):
            if not looks_like_toc_or_cover(p, i):
                useful_pages.append((i, p))
        
        # 3) Chunk per page, title-aware
        for page_idx, page_text in useful_pages:
            chunks = chunk_title_aware(page_text, file_name, page_start=page_idx, max_chars=max_chars, overlap=overlap)
            chunk_objs.extend(chunks)
            
    elif file_ext == '.docx':
        # Process Word document
        full_text = _read_word_document(file_path)
        if full_text:
            # For Word docs, treat as single "page" and chunk
            chunks = chunk_title_aware(full_text, file_name, page_start=1, max_chars=max_chars, overlap=overlap)
            chunk_objs.extend(chunks)
    else:
        print(f"Unsupported file type: {file_ext}. Skipping {file_name}")
        return
    
    # 4) Deduplicate
    chunk_objs = basic_deduplicate(chunk_objs)
    if not chunk_objs:
        print(f"No useful chunks found in {file_name}. Skipping.")
        return
    
    _add_chunks_to_index(chunk_objs, f"document {file_name}")

def build_vector_index_from_database():
    """Extract properties from database and add to vector index"""
    properties = _get_database_properties()
    if not properties:
        print("No properties found in database. Skipping.")
        return
    
    _add_chunks_to_index(properties, "database properties")

def _add_chunks_to_index(chunk_objs: List[dict], source_description: str):
    """Helper function to add chunks to FAISS index"""
    # 5) Encode + normalize
    texts = [c["text"] for c in chunk_objs]
    model = get_embedding_model()
    emb = model.encode(texts, convert_to_numpy=True)
    emb = _normalize(emb)
    dim = emb.shape[1]
    
    # 6) Index append
    index = _load_or_create_ip_index(dim)
    index.add(emb)
    
    # 7) Persist index & docs
    os.makedirs(os.path.dirname(INDEX_FILE), exist_ok=True)
    faiss.write_index(index, INDEX_FILE)
    
    if os.path.exists(DOC_FILE):
        with open(DOC_FILE, "rb") as f:
            existing = pickle.load(f)
        if not isinstance(existing, list):
            existing = []
    else:
        existing = []
    
    existing.extend(chunk_objs)
    
    with open(DOC_FILE, "wb") as f:
        pickle.dump(existing, f)
    
    print(f"Indexed {len(chunk_objs)} chunks from {source_description}. Total chunks: {len(existing)}")

def build_unified_vector_index(docs_directory: str = "data/docs", pdfs_directory: str = "data/pdfs", max_chars: int = 1000, overlap: int = 180):
    """Build unified vector index from all sources: PDFs, Word docs, and database"""
    print("BUILDING UNIFIED RAG INDEX")
    print("=" * 50)
    
    total_processed = 0
    
    # 1) Process Word documents from docs directory
    if os.path.exists(docs_directory):
        print(f"Processing Word documents from {docs_directory}")
        for filename in os.listdir(docs_directory):
            if filename.lower().endswith('.docx'):
                file_path = os.path.join(docs_directory, filename)
                print(f"Processing: {filename}")
                build_vector_index_from_file(file_path, max_chars, overlap)
                total_processed += 1
    
    # 2) Process PDFs from pdfs directory
    if os.path.exists(pdfs_directory):
        print(f"Processing PDFs from {pdfs_directory}")
        for filename in os.listdir(pdfs_directory):
            if filename.lower().endswith('.pdf'):
                file_path = os.path.join(pdfs_directory, filename)
                print(f"Processing: {filename}")
                build_vector_index_from_file(file_path, max_chars, overlap)
                total_processed += 1
    
    # 3) Process database properties
    print("Processing database properties")
    build_vector_index_from_database()
    
    print("\nUNIFIED RAG INDEX COMPLETED!")
    print(f"Processed {total_processed} document files + database properties")
    print("Sistema RAG unificado listo para consultas")
    print("\nEl sistema ahora puede responder sobre:")
    print("- Informacion de documentos Word (.docx)")
    print("- Informacion de documentos PDF (.pdf)")
    print("- Propiedades disponibles en la base de datos")
    print("- Consultas combinadas de ambas fuentes")

# Legacy function for backward compatibility
def build_vector_index(pdf_path: str, max_chars: int, overlap: int):
    """Legacy function - now delegates to new unified function"""
    build_vector_index_from_file(pdf_path, max_chars, overlap)
