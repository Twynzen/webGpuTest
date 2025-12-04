import { Injectable, signal, NgZone, inject } from '@angular/core';
import { pipeline, FeatureExtractionPipeline } from '@huggingface/transformers';
import { WebGpuService } from './webgpu.service';

export interface SearchResult {
  text: string;
  score: number;
  index: number;
  metadata?: Record<string, unknown>;
}

export interface IndexedDocument {
  text: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
}

/**
 * Available embedding models.
 */
export const EMBEDDING_MODELS = {
  miniLM: {
    id: 'Xenova/all-MiniLM-L6-v2',
    dimensions: 384,
    size: '~22 MB',
    description: 'Excellent balance of speed and quality',
  },
  bgeSmall: {
    id: 'Xenova/bge-small-en-v1.5',
    dimensions: 384,
    size: '~33 MB',
    description: 'Better for retrieval tasks',
  },
} as const;

/**
 * Service for semantic search using vector embeddings.
 * Uses Transformers.js v3 with WebGPU acceleration.
 */
@Injectable({ providedIn: 'root' })
export class EmbeddingsService {
  private extractor: FeatureExtractionPipeline | null = null;
  private indexedDocuments: IndexedDocument[] = [];

  private readonly webGpu = inject(WebGpuService);

  // Signals for reactive state
  readonly isLoading = signal(false);
  readonly loadProgress = signal(0);
  readonly isReady = signal(false);
  readonly isIndexing = signal(false);
  readonly isSearching = signal(false);
  readonly documentCount = signal(0);
  readonly currentModel = signal<string | null>(null);

  constructor(private ngZone: NgZone) {}

  /**
   * Initialize the embedding model.
   */
  async initialize(
    modelId: string = EMBEDDING_MODELS.miniLM.id
  ): Promise<void> {
    if (this.extractor && this.currentModel() === modelId) {
      return; // Already initialized with this model
    }

    this.isLoading.set(true);
    this.loadProgress.set(0);

    try {
      const device = this.webGpu.getPreferredDevice();

      const progressCallback = (progress: { status: string; progress?: number }) => {
        if (progress.status === 'progress' && typeof progress.progress === 'number') {
          this.ngZone.run(() => {
            this.loadProgress.set(Math.round(progress.progress!));
          });
        }
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.extractor = (await (pipeline as any)('feature-extraction', modelId, {
        device,
        progress_callback: progressCallback,
      })) as FeatureExtractionPipeline;

      this.currentModel.set(modelId);
      this.isLoading.set(false);
      this.isReady.set(true);
    } catch (error) {
      this.isLoading.set(false);
      console.error('Failed to initialize embeddings model:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for a list of texts.
   */
  async embed(texts: string[]): Promise<number[][]> {
    if (!this.extractor) {
      throw new Error('Model not initialized. Call initialize() first.');
    }

    return this.ngZone.runOutsideAngular(async () => {
      const output = await this.extractor!(texts, {
        pooling: 'mean',
        normalize: true,
      });

      return output.tolist() as number[][];
    });
  }

  /**
   * Index documents for semantic search.
   */
  async indexDocuments(
    documents: Array<{ text: string; metadata?: Record<string, unknown> }>
  ): Promise<void> {
    if (!this.extractor) {
      throw new Error('Model not initialized. Call initialize() first.');
    }

    this.isIndexing.set(true);

    try {
      const texts = documents.map((d) => d.text);

      const embeddings = await this.ngZone.runOutsideAngular(async () => {
        const output = await this.extractor!(texts, {
          pooling: 'mean',
          normalize: true,
        });
        return output.tolist() as number[][];
      });

      // Store indexed documents
      this.indexedDocuments = documents.map((doc, i) => ({
        text: doc.text,
        embedding: embeddings[i],
        metadata: doc.metadata,
      }));

      this.ngZone.run(() => {
        this.documentCount.set(this.indexedDocuments.length);
      });
    } finally {
      this.ngZone.run(() => {
        this.isIndexing.set(false);
      });
    }
  }

  /**
   * Add documents to the existing index.
   */
  async addDocuments(
    documents: Array<{ text: string; metadata?: Record<string, unknown> }>
  ): Promise<void> {
    if (!this.extractor) {
      throw new Error('Model not initialized. Call initialize() first.');
    }

    this.isIndexing.set(true);

    try {
      const texts = documents.map((d) => d.text);

      const embeddings = await this.ngZone.runOutsideAngular(async () => {
        const output = await this.extractor!(texts, {
          pooling: 'mean',
          normalize: true,
        });
        return output.tolist() as number[][];
      });

      // Add to existing index
      const newDocs = documents.map((doc, i) => ({
        text: doc.text,
        embedding: embeddings[i],
        metadata: doc.metadata,
      }));

      this.indexedDocuments.push(...newDocs);

      this.ngZone.run(() => {
        this.documentCount.set(this.indexedDocuments.length);
      });
    } finally {
      this.ngZone.run(() => {
        this.isIndexing.set(false);
      });
    }
  }

  /**
   * Search indexed documents by semantic similarity.
   */
  async search(query: string, topK: number = 5): Promise<SearchResult[]> {
    if (!this.extractor) {
      throw new Error('Model not initialized. Call initialize() first.');
    }

    if (this.indexedDocuments.length === 0) {
      return [];
    }

    this.isSearching.set(true);

    try {
      return await this.ngZone.runOutsideAngular(async () => {
        // Generate query embedding
        const output = await this.extractor!([query], {
          pooling: 'mean',
          normalize: true,
        });
        const queryEmbedding = (output.tolist() as number[][])[0];

        // Calculate cosine similarity with all documents
        const results = this.indexedDocuments
          .map((doc, index) => ({
            text: doc.text,
            score: this.cosineSimilarity(queryEmbedding, doc.embedding),
            index,
            metadata: doc.metadata,
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, topK);

        return results;
      });
    } finally {
      this.ngZone.run(() => {
        this.isSearching.set(false);
      });
    }
  }

  /**
   * Calculate cosine similarity between two vectors.
   * For normalized vectors, this equals the dot product.
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
    }
    return dotProduct;
  }

  /**
   * Clear all indexed documents.
   */
  clearIndex(): void {
    this.indexedDocuments = [];
    this.documentCount.set(0);
  }

  /**
   * Get all indexed documents.
   */
  getIndexedDocuments(): IndexedDocument[] {
    return [...this.indexedDocuments];
  }

  /**
   * Dispose the model and free resources.
   */
  async dispose(): Promise<void> {
    this.extractor = null;
    this.indexedDocuments = [];
    this.isReady.set(false);
    this.currentModel.set(null);
    this.documentCount.set(0);
  }
}
