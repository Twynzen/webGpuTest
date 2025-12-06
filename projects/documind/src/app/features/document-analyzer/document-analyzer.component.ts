import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  WebLLMService,
  RECOMMENDED_MODELS,
  DOCUMENT_ANALYSIS_SYSTEM_PROMPT,
  ModelInfo
} from '../../core/services/webllm.service';
import { WebGPUDetectionService, WebGPUCapabilities } from '../../core/services/webgpu-detection.service';
import {
  chunkDocument,
  extractDocumentMetadata,
  cleanDocumentText,
  createSynthesisPrompt,
  fitsInContext
} from '../../shared/utils/document-chunker';

type AnalysisStep = 'idle' | 'checking' | 'loading' | 'ready' | 'analyzing' | 'error';

@Component({
  selector: 'app-document-analyzer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './document-analyzer.component.html',
  styleUrl: './document-analyzer.component.scss'
})
export class DocumentAnalyzerComponent implements OnInit, OnDestroy {
  private readonly webllm = inject(WebLLMService);
  readonly webgpu = inject(WebGPUDetectionService);

  // UI State
  readonly step = signal<AnalysisStep>('idle');
  readonly documentText = signal('');
  readonly analysisResult = signal('');
  readonly selectedModelId = signal(RECOMMENDED_MODELS[0].id);
  readonly customPrompt = signal('');
  readonly useCustomPrompt = signal(false);
  readonly showAdvancedOptions = signal(false);

  // Analysis options
  readonly temperature = signal(0.3);
  readonly maxTokens = signal(2048);

  // Document metadata
  readonly documentMetadata = computed(() => {
    const text = this.documentText();
    if (!text.trim()) return null;
    return extractDocumentMetadata(text);
  });

  // Computed from services
  readonly models = RECOMMENDED_MODELS;
  readonly selectedModel = computed(() =>
    RECOMMENDED_MODELS.find(m => m.id === this.selectedModelId())
  );
  readonly capabilities = this.webgpu.capabilities;
  readonly loadingProgress = this.webllm.loadingProgress;
  readonly loadingPercentage = this.webllm.loadingPercentage;
  readonly isReady = this.webllm.isReady;
  readonly isGenerating = this.webllm.isGenerating;
  readonly lastError = this.webllm.lastError;
  readonly storageEstimate = this.webgpu.storageEstimate;

  readonly canAnalyze = computed(() =>
    this.isReady() &&
    !this.isGenerating() &&
    this.documentText().trim().length > 0
  );

  readonly needsChunking = computed(() => {
    const text = this.documentText();
    return text.trim().length > 0 && !fitsInContext(text, 3500);
  });

  async ngOnInit(): Promise<void> {
    this.step.set('checking');

    // Check WebGPU capabilities
    const caps = await this.webgpu.checkCapabilities();
    await this.webgpu.checkStorageQuota();

    if (!caps.supported) {
      this.step.set('error');
      return;
    }

    this.step.set('idle');
  }

  ngOnDestroy(): void {
    this.webllm.abort();
  }

  async loadModel(): Promise<void> {
    const model = this.selectedModel();
    if (!model) return;

    // Check shader-f16 requirement
    const caps = this.capabilities();
    if (model.requiresShaderF16 && !caps?.hasShaderF16) {
      return;
    }

    this.step.set('loading');

    try {
      await this.webllm.initialize(model.id);
      this.step.set('ready');
    } catch (error) {
      console.error('Error loading model:', error);
      this.step.set('error');
    }
  }

  async analyzeDocument(): Promise<void> {
    if (!this.canAnalyze()) return;

    const text = cleanDocumentText(this.documentText());
    const systemPrompt = this.useCustomPrompt()
      ? this.customPrompt()
      : DOCUMENT_ANALYSIS_SYSTEM_PROMPT;

    this.step.set('analyzing');
    this.analysisResult.set('');

    try {
      if (this.needsChunking()) {
        await this.analyzeWithChunking(text, systemPrompt);
      } else {
        await this.analyzeSinglePass(text, systemPrompt);
      }
      this.step.set('ready');
    } catch (error) {
      console.error('Error analyzing document:', error);
      this.step.set('error');
    }
  }

  private async analyzeSinglePass(text: string, systemPrompt: string): Promise<void> {
    let result = '';
    for await (const chunk of this.webllm.generateStream(text, systemPrompt, {
      temperature: this.temperature(),
      maxTokens: this.maxTokens()
    })) {
      result += chunk;
      this.analysisResult.set(result);
    }
  }

  private async analyzeWithChunking(text: string, systemPrompt: string): Promise<void> {
    const { chunks, totalChunks } = chunkDocument(text);
    const summaries: string[] = [];

    // Analyze each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkPrompt = `Analiza el siguiente fragmento (${i + 1} de ${totalChunks}) de un documento más largo:\n\n${chunk.content}`;

      let chunkResult = '';
      this.analysisResult.set(`Analizando fragmento ${i + 1} de ${totalChunks}...\n\n`);

      for await (const token of this.webllm.generateStream(chunkPrompt, systemPrompt, {
        temperature: this.temperature(),
        maxTokens: Math.floor(this.maxTokens() / 2)
      })) {
        chunkResult += token;
        this.analysisResult.set(`Fragmento ${i + 1}/${totalChunks}:\n${chunkResult}`);
      }

      summaries.push(chunkResult);
      await this.webllm.resetChat();
    }

    // Synthesis pass
    this.analysisResult.set('Generando síntesis final...\n\n');
    const synthesisPrompt = createSynthesisPrompt(summaries, extractDocumentMetadata(text).wordCount);

    let finalResult = '';
    for await (const token of this.webllm.generateStream(synthesisPrompt, systemPrompt, {
      temperature: this.temperature(),
      maxTokens: this.maxTokens()
    })) {
      finalResult += token;
      this.analysisResult.set(finalResult);
    }
  }

  async stopGeneration(): Promise<void> {
    await this.webllm.abort();
    this.step.set('ready');
  }

  clearDocument(): void {
    this.documentText.set('');
    this.analysisResult.set('');
  }

  async handleFileUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      this.documentText.set(text);
    } catch (error) {
      console.error('Error reading file:', error);
    }
  }

  selectModel(modelId: string): void {
    this.selectedModelId.set(modelId);
  }

  toggleAdvancedOptions(): void {
    this.showAdvancedOptions.update(v => !v);
  }

  copyResult(): void {
    navigator.clipboard.writeText(this.analysisResult());
  }
}
