import { Injectable, signal, computed } from '@angular/core';
import * as webllm from '@mlc-ai/web-llm';

export interface LoadingProgress {
  text: string;
  progress: number;
  timeElapsed?: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  vram: string;
  context: number;
  description: string;
  requiresShaderF16: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerationStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  tokensPerSecond: number;
}

// Modelos recomendados para análisis documental
export const RECOMMENDED_MODELS: ModelInfo[] = [
  {
    id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
    name: 'Phi-3.5 Mini',
    vram: '3.67 GB',
    context: 4096,
    description: 'Recomendado: Mejor balance entre capacidad analítica y recursos',
    requiresShaderF16: false
  },
  {
    id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 3B',
    vram: '2.26 GB',
    context: 4096,
    description: 'Equilibrio calidad/tamaño para dispositivos con menos memoria',
    requiresShaderF16: false
  },
  {
    id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 3B',
    vram: '2.50 GB',
    context: 4096,
    description: 'Excelente para documentos multilingües',
    requiresShaderF16: false
  },
  {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 1B',
    vram: '879 MB',
    context: 4096,
    description: 'Modelo ligero para dispositivos con recursos limitados',
    requiresShaderF16: false
  },
  {
    id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.1 8B',
    vram: '5.00 GB',
    context: 4096,
    description: 'Máxima calidad para GPUs dedicadas potentes',
    requiresShaderF16: false
  }
];

// System prompt optimizado para análisis documental
export const DOCUMENT_ANALYSIS_SYSTEM_PROMPT = `Eres un asistente especializado en análisis de documentos.

INSTRUCCIONES:
- Extrae entidades clave (personas, organizaciones, fechas, cifras)
- Identifica temas principales y subtemas
- Señala inconsistencias o puntos de atención
- Mantén objetividad y precisión
- Responde en español a menos que se indique lo contrario

FORMATO DE RESPUESTA:
1. **Resumen ejecutivo** (2-3 oraciones)
2. **Entidades identificadas** (lista)
3. **Temas principales** (numerados)
4. **Observaciones críticas** (si aplica)`;

@Injectable({ providedIn: 'root' })
export class WebLLMService {
  private engine: webllm.MLCEngineInterface | null = null;
  private abortController: AbortController | null = null;
  private loadStartTime: number = 0;

  // Signals for reactive state management
  readonly loadingProgress = signal<LoadingProgress>({ text: '', progress: 0 });
  readonly isLoading = signal(false);
  readonly isReady = signal(false);
  readonly isGenerating = signal(false);
  readonly currentModel = signal<string | null>(null);
  readonly lastError = signal<string | null>(null);
  readonly generationStats = signal<GenerationStats | null>(null);

  // Computed signals
  readonly loadingPercentage = computed(() => Math.round(this.loadingProgress().progress * 100));
  readonly canGenerate = computed(() => this.isReady() && !this.isGenerating());

  async initialize(modelId: string = 'Phi-3.5-mini-instruct-q4f16_1-MLC'): Promise<void> {
    if (this.isLoading()) {
      throw new Error('Ya hay una carga de modelo en progreso');
    }

    this.isLoading.set(true);
    this.lastError.set(null);
    this.loadStartTime = Date.now();

    try {
      // Unload previous model if exists
      if (this.engine) {
        await this.engine.unload();
        this.engine = null;
      }

      this.engine = await webllm.CreateMLCEngine(modelId, {
        initProgressCallback: (progress) => {
          const timeElapsed = (Date.now() - this.loadStartTime) / 1000;
          this.loadingProgress.set({
            text: progress.text,
            progress: progress.progress,
            timeElapsed
          });
        }
      });

      // Setup device lost handler
      if ('device' in this.engine && this.engine.device) {
        (this.engine.device as GPUDevice).lost.then((info: GPUDeviceLostInfo) => {
          console.error('GPU device lost:', info.message);
          this.lastError.set(`GPU perdida: ${info.message}. Intenta recargar la página o usar un modelo más pequeño.`);
          this.isReady.set(false);
        });
      }

      this.currentModel.set(modelId);
      this.isReady.set(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      this.lastError.set(`Error cargando modelo: ${message}`);
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }

  async *generateStream(
    userMessage: string,
    systemPrompt: string = DOCUMENT_ANALYSIS_SYSTEM_PROMPT,
    options: { temperature?: number; maxTokens?: number } = {}
  ): AsyncGenerator<string> {
    if (!this.engine) {
      throw new Error('Motor no inicializado. Llama a initialize() primero.');
    }

    if (this.isGenerating()) {
      throw new Error('Ya hay una generación en progreso');
    }

    this.isGenerating.set(true);
    this.abortController = new AbortController();

    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ];

      const stream = await this.engine.chat.completions.create({
        messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 2048,
        stream: true,
        stream_options: { include_usage: true }
      });

      for await (const chunk of stream) {
        // Check for abort
        if (this.abortController?.signal.aborted) {
          break;
        }

        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          yield content;
        }

        // Capture usage stats from final chunk
        if (chunk.usage) {
          this.generationStats.set({
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
            tokensPerSecond: 0 // Will be calculated after completion
          });
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        this.lastError.set(`Error en generación: ${error.message}`);
        throw error;
      }
    } finally {
      this.isGenerating.set(false);
      this.abortController = null;
    }
  }

  async generate(
    userMessage: string,
    systemPrompt: string = DOCUMENT_ANALYSIS_SYSTEM_PROMPT,
    options: { temperature?: number; maxTokens?: number } = {}
  ): Promise<string> {
    let result = '';
    for await (const chunk of this.generateStream(userMessage, systemPrompt, options)) {
      result += chunk;
    }
    return result;
  }

  async abort(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
    }
    if (this.engine) {
      await this.engine.interruptGenerate();
    }
    this.isGenerating.set(false);
  }

  async resetChat(): Promise<void> {
    if (this.engine) {
      await this.engine.resetChat();
    }
  }

  async unload(): Promise<void> {
    if (this.engine) {
      await this.engine.unload();
      this.engine = null;
    }
    this.isReady.set(false);
    this.currentModel.set(null);
  }

  getModelInfo(modelId: string): ModelInfo | undefined {
    return RECOMMENDED_MODELS.find(m => m.id === modelId);
  }

  getRecommendedModels(): ModelInfo[] {
    return [...RECOMMENDED_MODELS];
  }
}
