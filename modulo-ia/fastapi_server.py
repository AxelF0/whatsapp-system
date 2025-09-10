#!/usr/bin/env python3
# fastapi_server.py - Servidor FastAPI para módulo-ia

import os
import sys
import logging
from datetime import datetime
from typing import Optional, List, Dict

# Add the app directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Crear app FastAPI
app = FastAPI(
    title="Remaxi - Remax Express IA",
    description="Asistente inmobiliario inteligente para consultas de venta y alquiler",
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

# Importar servicios IA (con fallback)
try:
    from app.services.ia_service import ask_mistral_with_context, get_index_overview, build_softgrounded_reply
    logger.info("✅ Servicios IA cargados correctamente")
    IA_SERVICES_AVAILABLE = True
except Exception as e:
    logger.warning(f"⚠️ Servicios IA no disponibles: {e}")
    IA_SERVICES_AVAILABLE = False
    
    # Crear funciones mock
    def ask_mistral_with_context(query, history=""):
        return {"question": query, "answer": "Servicio IA no disponible temporalmente", "used_context": False}
    
    def get_index_overview():
        return {"total_chunks": 0, "pdfs": []}
    
    def build_softgrounded_reply(query):
        return "Sistema RAG no disponible. Por favor contacta a un agente."

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
        "service": "Remaxi - Remax Express IA",
        "bot_name": "Remaxi",
        "company": "Remax Express",
        "status": "online",
        "version": "1.0.0",
        "endpoints": {
            "query": "/api/query",
            "health": "/api/health",
            "status": "/api/status",
            "docs": "/docs"
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
                "ready": overview["total_chunks"] > 0,
                "services_available": IA_SERVICES_AVAILABLE
            },
            timestamp=datetime.now().isoformat()
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
                "services_available": IA_SERVICES_AVAILABLE,
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
        
        if not IA_SERVICES_AVAILABLE:
            return QueryResponse(
                success=True,
                answer="El sistema de consultas no está completamente disponible. Un agente te contactará pronto para ayudarte.",
                used_context=False,
                metadata={"error": "services_not_available"},
                requires_agent_attention=True
            )
        
        # 1. Verificar que el sistema RAG esté listo
        overview = get_index_overview()
        if overview["total_chunks"] == 0:
            return QueryResponse(
                success=True,
                answer="El sistema de consultas se está preparando. Por favor intenta en unos momentos o contacta directamente a un agente.",
                used_context=False,
                metadata={"error": "no_index_content"},
                requires_agent_attention=True
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
        
        # 🔍 LOG DETALLADO - IA DEVUELVE
        logger.info(f"🔍 IA PASO 1 - Respuesta generada:")
        logger.info(f"   📝 answer: '{result['answer'][:100]}...' (len: {len(result['answer'])})")
        logger.info(f"   ✅ success: True")
        logger.info(f"   📊 used_context: {result['used_context']}")
        
        response_data = QueryResponse(
            success=True,
            answer=result["answer"],
            used_context=result["used_context"],
            metadata=metadata,
            requires_agent_attention=requires_attention,
            suggested_actions=suggested_actions
        )
        
        logger.info(f"🔍 IA PASO 2 - Enviando respuesta a procesamiento:")
        logger.info(f"   📝 response.answer: '{response_data.answer[:100]}...'")
        logger.info(f"   📊 response.success: {response_data.success}")
        
        return response_data
        
    except Exception as e:
        logger.error(f"❌ Error procesando consulta: {e}")
        
        # Respuesta de fallback
        fallback_answer = build_softgrounded_reply(request.question)
        
        return QueryResponse(
            success=True,
            answer=fallback_answer,
            used_context=False,
            metadata={"error": str(e), "fallback": True},
            requires_agent_attention=True
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
    Analizar si el cliente muestra interés alto y requiere coordinación de cita
    """
    question_lower = question.lower()
    answer_lower = answer.lower()
    
    # Frases de ALTO interés que requieren acción inmediata
    high_interest_phrases = [
        'precio', 'precios', 'costo', 'valor', 'cuanto cuesta', 'cuánto cuesta',
        'mas informacion', 'más información', 'mas detalles', 'más detalles', 
        'caracteristicas', 'características', 'ubicacion', 'ubicación',
        'quiero ver', 'me interesa', 'me gusta', 'visitar', 'ver la propiedad',
        'agendar', 'cita', 'visita', 'cuando puedo', 'disponible',
        'contactar', 'telefono', 'teléfono', 'llamar', 'whatsapp',
        'comprar', 'alquilar', 'rentar', 'vender'
    ]
    
    # Frases que indican intención de agendar cita
    appointment_phrases = [
        'agendar', 'cita', 'visita', 'ver la propiedad', 'coordinar',
        'cuando puedo', 'disponible para', 'visitar', 'conocer'
    ]
    
    # Detectar interés alto en la pregunta
    interest_detected = any(phrase in question_lower for phrase in high_interest_phrases)
    
    # Detectar si quiere agendar cita específicamente
    wants_appointment = any(phrase in question_lower for phrase in appointment_phrases)
    
    # Si detecta frase de cita en la respuesta de la IA
    appointment_in_answer = "COORDINAR_CITA_INMOBILIARIA" in answer
    
    suggested_actions = None
    if interest_detected or wants_appointment:
        suggested_actions = [
            "Cliente muestra interés alto - contactar prioritariamente",
            "Ofrecer información detallada de propiedades",
            "Agendar cita de visita personalizada",
            "Proporcionar catálogo de propiedades similares"
        ]
        
        # Si hay frase clave de cita, marcarlo para seguimiento especial
        if appointment_in_answer or wants_appointment:
            suggested_actions.append("COORDINAR_CITA_INMOBILIARIA")
    
    return interest_detected, suggested_actions

if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("IA_PORT", 3007))
    host = os.getenv("IA_HOST", "127.0.0.1")
    
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
    print("  • GET /docs - Documentación API")
    print("=" * 50)
    
    uvicorn.run(
        "fastapi_server:app",  # Especificar módulo:app
        host=host,
        port=port,
        reload=False,
        log_level="info"
    )