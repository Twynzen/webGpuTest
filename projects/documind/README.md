# DocuMind

Análisis de documentos con IA directamente en tu navegador usando WebLLM y WebGPU.

## Características

- **100% Local**: Procesamiento completamente en el navegador. Tus documentos nunca salen de tu dispositivo.
- **WebGPU Acelerado**: Hasta 80% del rendimiento nativo gracias a WebGPU.
- **Múltiples Modelos**: Soporte para Phi-3.5, Llama 3.2, Qwen 2.5 y más.
- **Chunking Inteligente**: Análisis automático de documentos largos mediante fragmentación con overlap.
- **Caché Persistente**: Los modelos se descargan una vez y se guardan en IndexedDB.

## Requisitos

### Navegadores Compatibles

| Navegador | Versión | Windows | macOS | Linux |
|-----------|---------|---------|-------|-------|
| Chrome/Edge | 113+ | Si | Si | Flag |
| Firefox | 141+ | Si | Limitado | - |
| Safari | 26+ | - | Tech Preview | - |

### Hardware

- **VRAM Mínima**: 1 GB (Llama 3.2 1B)
- **VRAM Recomendada**: 4 GB (Phi-3.5 Mini)
- GPU con soporte WebGPU

## Instalación

```bash
# Desde el directorio raíz del proyecto
npm install

# Ejecutar DocuMind
npm run start:documind
```

DocuMind estará disponible en `http://localhost:4201`

## Modelos Disponibles

| Modelo | VRAM | Descripción |
|--------|------|-------------|
| **Phi-3.5 Mini** | 3.67 GB | Recomendado para análisis complejo |
| Llama 3.2 3B | 2.26 GB | Balance calidad/tamaño |
| Qwen 2.5 3B | 2.50 GB | Excelente para multilingüe |
| Llama 3.2 1B | 879 MB | Dispositivos limitados |
| Llama 3.1 8B | 5.00 GB | Máxima calidad |

## Uso

1. **Selecciona un modelo** según los recursos de tu dispositivo
2. **Espera la carga** (primera vez descarga, después usa caché)
3. **Ingresa o carga** el documento a analizar
4. **Obtén el análisis** con resumen ejecutivo, entidades y temas

### Análisis de Documentos Largos

DocuMind automáticamente detecta documentos que exceden el contexto del modelo (~3000 palabras) y los fragmenta para análisis por partes, generando una síntesis final coherente.

## Arquitectura

```
projects/documind/
├── src/
│   ├── app/
│   │   ├── core/services/
│   │   │   ├── webgpu-detection.service.ts  # Detección de capacidades
│   │   │   └── webllm.service.ts            # Servicio principal LLM
│   │   ├── features/
│   │   │   └── document-analyzer/           # Componente principal
│   │   └── shared/utils/
│   │       └── document-chunker.ts          # Utilidades de chunking
│   └── styles.scss
└── package.json
```

## Scripts

```bash
npm run start:documind    # Servidor de desarrollo (puerto 4201)
npm run build:documind    # Build de producción
npm run test:documind     # Tests unitarios
```

## Tecnologías

- **Angular 18** con Signals y Standalone Components
- **WebLLM 0.2.80** para inferencia de LLMs
- **WebGPU** para aceleración de GPU
- **IndexedDB** para caché de modelos

## Privacidad

Todo el procesamiento ocurre localmente en tu navegador:
- Los documentos nunca se envían a servidores externos
- Los modelos se descargan una vez y se cachean localmente
- No hay telemetría ni tracking

## Licencia

MIT
