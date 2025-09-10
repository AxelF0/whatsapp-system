#!/usr/bin/env python3
# app.py - FastAPI server para módulo-ia integrado con el sistema WhatsApp

import os
import sys
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict
import logging
from datetime import datetime

# Add the app directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.services.ia_service import ask_mistral_with_context, get_index_overview, build_softgrounded_reply

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Crear app FastAPI
app = FastAPI(
    title="REMAXI - Módulo IA",
    description="Servicio RAG unificado para consultas inmobiliarias",
    version="1.0.0"
)

# Configurar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Modelos Pydantic
class QueryRequest(BaseModel):
    question: str
    from_phone: Optional[str] = None
    to_phone: Optional[str] = None
    conversation_history: Optional[str] = ""
    source: Optional[str] = "whatsapp"

class QueryResponse(BaseModel):
    success: bool
    answer: str
    used_context: bool
    metadata: Optional[Dict] = None
    requires_agent_attention: bool = False
    suggested_actions: Optional[List[str]] = None

class HealthResponse(BaseModel):
    status: str
    service: str
    index_status: Dict
    timestamp: str

# ==================== ENDPOINTS ====================

@app.get("/", response_model=Dict)
async def root():
    """Endpoint raíz"""
    return {
        "service": "REMAXI - Módulo IA",
        "status": "online",
        "endpoints": {
            "query": "/api/query",
            "health": "/api/health",
            "status": "/api/status"
        }
    }

@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """Health check del servicio IA"""
    try:
        overview = get_index_overview()
        return HealthResponse(
            status="healthy",
            service="modulo-ia",
            index_status={
                "total_chunks": overview["total_chunks"],
                "pdfs_indexed": len(overview["pdfs"]),
                "ready": overview["total_chunks"] > 0
            },
            timestamp=str(datetime.now().isoformat())
        )
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=500, detail=f"Service unhealthy: {str(e)}")

@app.get("/api/status")
async def get_status():
    """Estado detallado del sistema RAG"""
    try:
        overview = get_index_overview()
        return {
            "success": True,
            "data": {
                "service": "modulo-ia",
                "rag_status": "ready" if overview["total_chunks"] > 0 else "no_content",
                "index_overview": overview,
                "capabilities": [
                    "Consultas sobre propiedades",
                    "Búsqueda en documentos PDF",
                    "Búsqueda en documentos Word", 
                    "Información de base de datos",
                    "Detección de interés del cliente"
                ]
            }
        }
    except Exception as e:
        logger.error(f"Status check failed: {e}")
        return {"success": False, "error": str(e)}

@app.post("/api/query", response_model=QueryResponse)
async def process_query(request: QueryRequest):
    """
    Endpoint principal para procesar consultas inmobiliarias
    Usado por módulo-procesamiento cuando detecta consulta IA
    """
    try:
        logger.info(f"📥 Nueva consulta desde {request.from_phone}: {request.question[:50]}...")
        
        # 1. Verificar que el sistema RAG esté listo
        overview = get_index_overview()
        if overview["total_chunks"] == 0:
            return QueryResponse(
                success=False,
                answer="El sistema de consultas no está disponible temporalmente. Por favor intenta más tarde.",
                used_context=False,
                metadata={"error": "no_index_content"}
            )
        
        # 2. Procesar consulta con RAG
        result = ask_mistral_with_context(request.question, request.conversation_history)
        
        # 3. Analizar respuesta para detectar interés del cliente
        requires_attention, suggested_actions = _analyze_client_interest(
            request.question, 
            result["answer"]
        )
        
        # 4. Preparar metadata para módulo-respuestas
        metadata = {
            "from_phone": request.from_phone,
            "to_phone": request.to_phone,
            "source": request.source,
            "query_type": _classify_query(request.question),
            "confidence": "high" if result["used_context"] else "low"
        }
        
        logger.info(f"✅ Consulta procesada - Contexto usado: {result['used_context']}")
        
        return QueryResponse(
            success=True,
            answer=result["answer"],
            used_context=result["used_context"],
            metadata=metadata,
            requires_agent_attention=requires_attention,
            suggested_actions=suggested_actions
        )
        
    except Exception as e:
        logger.error(f"❌ Error procesando consulta: {e}")
        
        # Respuesta de fallback
        fallback_answer = build_softgrounded_reply(request.question)
        
        return QueryResponse(
            success=True,
            answer=fallback_answer,
            used_context=False,
            metadata={"error": str(e), "fallback": True},
            requires_agent_attention=False
        )

def _classify_query(question: str) -> str:
    """Clasificar tipo de consulta"""
    question_lower = question.lower()
    
    if any(word in question_lower for word in ['precio', 'costo', 'valor', 'cuanto']):
        return "price_inquiry"
    elif any(word in question_lower for word in ['ubicacion', 'zona', 'donde', 'direccion']):
        return "location_inquiry"
    elif any(word in question_lower for word in ['casa', 'departamento', 'terreno', 'propiedad']):
        return "property_inquiry"
    elif any(word in question_lower for word in ['venta', 'vender', 'comprar']):
        return "sale_inquiry"
    elif any(word in question_lower for word in ['alquiler', 'alquilar', 'rentar']):
        return "rental_inquiry"
    else:
        return "general_inquiry"

def _analyze_client_interest(question: str, answer: str) -> tuple[bool, Optional[List[str]]]:
    """
    Analizar si el cliente muestra interés y requiere atención del agente
    """
    question_lower = question.lower()
    answer_lower = answer.lower()
    
    # Frases que indican alto interés
    high_interest_phrases = [
        'mas informacion', 'más información', 'mas detalles', 'más detalles',
        'quiero ver', 'me interesa', 'agendar', 'cita', 'visita',
        'cuando puedo', 'disponible para', 'contactar', 'telefono',
        'coordinar cita', 'más info', 'caracteristicas', 'precio exacto'
    ]
    
    # Detectar interés en la pregunta
    interest_detected = any(phrase in question_lower for phrase in high_interest_phrases)
    
    # Si hay interés, sugerir acciones
    suggested_actions = None
    if interest_detected:
        suggested_actions = [
            "Ofrecer agendar cita de visita",
            "Proporcionar información de contacto del agente",
            "Enviar detalles adicionales de la propiedad",
            "Coordinar llamada telefónica"
        ]
    
    return interest_detected, suggested_actions

if __name__ == "__main__":
    port = int(os.getenv("IA_PORT", 8000))
    host = os.getenv("IA_HOST", "0.0.0.0")
    
    print("🚀 INICIANDO REMAXI - REMAX EXPRESS IA")
    print("=" * 50)
    print(f"Bot: Remaxi 🤖")
    print(f"Empresa: Remax Express 🏢") 
    print(f"Puerto: {port}")
    print(f"Host: {host}")
    print("Endpoints disponibles:")
    print("  • POST /api/query - Procesar consultas inmobiliarias")
    print("  • GET /api/health - Estado del servicio") 
    print("  • GET /api/status - Estado RAG detallado")
    print("=" * 50)
    
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info"
    )