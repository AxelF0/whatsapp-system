# /scripts/create_index.py
# Script para crear el índice RAG unificado (PDFs + Word + Base de datos)

import os
import sys
from pathlib import Path

# Add the app directory to the Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.embedding_service import build_unified_vector_index

def main():
    """
    Crear índice RAG unificado desde todas las fuentes:
    - Documentos PDF y Word en data/docs/
    - PDFs legacy en data/pdfs/
    - Propiedades de base de datos PostgreSQL
    """
    
    print("REMAXI - CREADOR DE INDICE RAG UNIFICADO")
    print("=" * 60)
    print("Este script creara un indice que combina:")
    print("- Documentos PDF y Word")
    print("- Propiedades de la base de datos")
    print("- Para consultas inmobiliarias unificadas")
    print("=" * 60)
    
    # Directories
    docs_directory = os.getenv("DOCS_SOURCE_PATH", "data/docs")
    pdfs_directory = os.getenv("PDF_SOURCE_PATH", "data/pdfs")
    
    # Configuration
    max_chars = int(os.getenv("CHUNK_MAX_CHARS", "1000"))
    overlap = int(os.getenv("CHUNK_OVERLAP", "180"))
    
    print(f"Directorio docs (Word): {docs_directory}")
    print(f"Directorio PDFs: {pdfs_directory}")
    print(f"Configuracion: {max_chars} chars, {overlap} overlap")
    print()
    
    # Create directories if they don't exist
    os.makedirs(docs_directory, exist_ok=True)
    os.makedirs(pdfs_directory, exist_ok=True)
    
    try:
        # Build unified index
        build_unified_vector_index(
            docs_directory=docs_directory,
            pdfs_directory=pdfs_directory, 
            max_chars=max_chars,
            overlap=overlap
        )
        
        print("\n" + "=" * 60)
        print("INSTRUCCIONES PARA USO:")
        print("1. Coloca documentos PDF y Word en data/docs/")
        print("2. Asegurate que la BD tenga propiedades registradas")
        print("3. Inicia Ollama: ollama run phi")
        print("4. El sistema RAG estara listo para consultas como:")
        print("   - 'propiedades en zona norte'")
        print("   - 'casas para venta'") 
        print("   - 'informacion sobre departamentos'")
        print("=" * 60)
        
    except Exception as e:
        print(f"Error creando indice: {e}")
        print("Verifica que:")
        print("- La base de datos este disponible")
        print("- Los directorios de documentos existan")
        print("- Las dependencias esten instaladas")

if __name__ == "__main__":
    main()
