# app/services/db_pool.py
"""
Connection pooling para PostgreSQL con cache de propiedades
Optimizado para rendimiento en consultas RAG
"""

import os
import threading
import time
from typing import List, Dict, Optional
import psycopg2
from psycopg2 import pool
from datetime import datetime, timedelta

# Configuración del pool
DB_POOL_MIN_CONN = int(os.getenv("DB_POOL_MIN_CONN", "1"))
DB_POOL_MAX_CONN = int(os.getenv("DB_POOL_MAX_CONN", "5"))
CACHE_TTL_SECONDS = int(os.getenv("PROPERTIES_CACHE_TTL", "300"))  # 5 minutos

class DatabaseConnectionPool:
    def __init__(self):
        self._pool = None
        self._cache = {}
        self._cache_timestamp = None
        self._lock = threading.Lock()
        self._init_pool()
    
    def _init_pool(self):
        """Initialize connection pool"""
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
            
            self._pool = psycopg2.pool.ThreadedConnectionPool(
                DB_POOL_MIN_CONN, 
                DB_POOL_MAX_CONN, 
                **db_config
            )
            print(f"✅ Pool de conexiones PostgreSQL inicializado ({DB_POOL_MIN_CONN}-{DB_POOL_MAX_CONN} conexiones)")
            
        except Exception as e:
            print(f"❌ Error inicializando pool de conexiones: {e}")
            self._pool = None
    
    def _is_cache_valid(self) -> bool:
        """Check if cache is still valid"""
        if self._cache_timestamp is None:
            return False
        
        return datetime.now() - self._cache_timestamp < timedelta(seconds=CACHE_TTL_SECONDS)
    
    def get_properties(self) -> List[Dict]:
        """Get properties with caching"""
        with self._lock:
            # Check cache first
            if self._is_cache_valid() and 'properties' in self._cache:
                print(f"🚀 Usando cache de propiedades ({len(self._cache['properties'])} propiedades)")
                return self._cache['properties']
            
            # Cache miss - fetch from database
            return self._fetch_properties_from_db()
    
    def _fetch_properties_from_db(self) -> List[Dict]:
        """Fetch properties from database and update cache"""
        if self._pool is None:
            print("❌ Pool de conexiones no disponible")
            return []
        
        conn = None
        try:
            conn = self._pool.getconn()
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
            
            start_time = time.time()
            cursor.execute(query)
            results = cursor.fetchall()
            query_time = time.time() - start_time
            
            cursor.close()
            
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
                        'pdf': f'BD_Propiedad_{prop_id}',
                        'title': f'{tipo} en {ubicacion}',
                        'page_start': 1
                    }
                })
            
            # Update cache
            self._cache['properties'] = properties
            self._cache_timestamp = datetime.now()
            
            print(f"✅ Propiedades cargadas desde BD: {len(properties)} en {query_time:.2f}s - Cache actualizado")
            return properties
            
        except Exception as e:
            print(f"❌ Error consultando propiedades: {e}")
            return []
        
        finally:
            if conn:
                self._pool.putconn(conn)
    
    def clear_cache(self):
        """Clear properties cache (useful for testing or manual refresh)"""
        with self._lock:
            self._cache.clear()
            self._cache_timestamp = None
            print("🧹 Cache de propiedades limpiado")
    
    def __del__(self):
        """Cleanup connection pool"""
        if self._pool:
            self._pool.closeall()

# Global singleton instance
_db_pool_instance: Optional[DatabaseConnectionPool] = None
_pool_lock = threading.Lock()

def get_db_pool() -> DatabaseConnectionPool:
    """Get singleton database pool instance"""
    global _db_pool_instance
    if _db_pool_instance is None:
        with _pool_lock:
            if _db_pool_instance is None:
                _db_pool_instance = DatabaseConnectionPool()
    return _db_pool_instance

def get_cached_properties() -> List[Dict]:
    """Convenience function to get cached properties"""
    return get_db_pool().get_properties()