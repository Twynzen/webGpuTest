import { Injectable, inject, signal } from '@angular/core';
import { EmbeddingsService } from '../ai/embeddings.service';

/**
 * Categories for organizing NPC knowledge.
 */
export enum KnowledgeCategory {
  INVENTORY = 'inventory',
  LORE = 'lore',
  ENVIRONMENT = 'environment',
  BEHAVIOR = 'behavior',
  WORLD = 'world',
}

/**
 * A single piece of knowledge that the NPC "knows".
 */
export interface KnowledgeDocument {
  id: string;
  text: string;
  category: KnowledgeCategory;
  metadata?: Record<string, unknown>;
}

/**
 * Search options for querying the knowledge base.
 */
export interface KnowledgeSearchOptions {
  topK?: number;
  minScore?: number;
  categories?: KnowledgeCategory[];
}

/**
 * Search result with similarity score.
 */
export interface KnowledgeSearchResult {
  document: KnowledgeDocument;
  score: number;
}

interface IndexedKnowledge {
  documents: KnowledgeDocument[];
  embeddings: number[][];
}

/**
 * RAG (Retrieval-Augmented Generation) service for NPC knowledge.
 *
 * This service manages knowledge bases for NPCs and provides semantic search
 * using vector embeddings. It enables NPCs to have contextual knowledge about
 * their inventory, backstory, environment, and behaviors.
 *
 * HOW IT WORKS:
 * 1. Knowledge documents are indexed by generating embeddings (numerical vectors)
 * 2. When searching, the query is also converted to an embedding
 * 3. Cosine similarity is used to find the most relevant documents
 * 4. Top-K most similar documents are returned for use in LLM prompts
 *
 * USAGE:
 * ```typescript
 * // Index knowledge for an NPC
 * await knowledgeService.indexKnowledge('vendor_1', [
 *   { id: 'item_1', text: 'Health Potion heals 50 HP', category: KnowledgeCategory.INVENTORY }
 * ]);
 *
 * // Search for relevant knowledge
 * const results = await knowledgeService.search('vendor_1', 'What can heal me?');
 * // Returns documents about healing items
 * ```
 */
@Injectable({ providedIn: 'root' })
export class NpcKnowledgeService {
  private readonly embeddings = inject(EmbeddingsService);
  private knowledgeBases: Map<string, IndexedKnowledge> = new Map();

  // Signals for reactive state
  readonly isIndexing = signal(false);
  readonly indexProgress = signal(0);

  /**
   * Index knowledge documents for an NPC.
   * This creates embeddings for all documents enabling semantic search.
   *
   * @param npcId - Unique identifier for the NPC
   * @param documents - Array of knowledge documents to index
   */
  async indexKnowledge(
    npcId: string,
    documents: KnowledgeDocument[]
  ): Promise<void> {
    if (documents.length === 0) {
      this.knowledgeBases.set(npcId, { documents: [], embeddings: [] });
      return;
    }

    this.isIndexing.set(true);
    this.indexProgress.set(0);

    try {
      // Ensure embeddings model is initialized
      if (!this.embeddings.isReady()) {
        await this.embeddings.initialize();
      }

      this.indexProgress.set(30);

      // Generate embeddings for all documents
      const texts = documents.map((doc) => doc.text);
      const vectors = await this.embeddings.embed(texts);

      this.indexProgress.set(100);

      // Store indexed knowledge
      this.knowledgeBases.set(npcId, {
        documents,
        embeddings: vectors,
      });

      console.log(`[NpcKnowledge] Indexed ${documents.length} documents for NPC: ${npcId}`);
    } finally {
      this.isIndexing.set(false);
    }
  }

  /**
   * Add additional documents to an existing knowledge base.
   *
   * @param npcId - Unique identifier for the NPC
   * @param documents - New documents to add
   */
  async addKnowledge(
    npcId: string,
    documents: KnowledgeDocument[]
  ): Promise<void> {
    const existing = this.knowledgeBases.get(npcId);

    if (!existing) {
      // No existing knowledge, create new
      await this.indexKnowledge(npcId, documents);
      return;
    }

    this.isIndexing.set(true);

    try {
      // Generate embeddings for new documents
      const texts = documents.map((doc) => doc.text);
      const vectors = await this.embeddings.embed(texts);

      // Merge with existing
      existing.documents.push(...documents);
      existing.embeddings.push(...vectors);

      console.log(`[NpcKnowledge] Added ${documents.length} documents to NPC: ${npcId}`);
    } finally {
      this.isIndexing.set(false);
    }
  }

  /**
   * Search knowledge base using semantic similarity.
   *
   * @param npcId - Unique identifier for the NPC
   * @param query - The search query (user's message or question)
   * @param options - Search options (topK, minScore, categories)
   * @returns Array of relevant documents sorted by similarity
   */
  async search(
    npcId: string,
    query: string,
    options: KnowledgeSearchOptions = {}
  ): Promise<KnowledgeSearchResult[]> {
    const { topK = 5, minScore = 0.3, categories } = options;

    const knowledge = this.knowledgeBases.get(npcId);
    if (!knowledge || knowledge.documents.length === 0) {
      console.warn(`[NpcKnowledge] No knowledge base found for NPC: ${npcId}`);
      return [];
    }

    // Generate query embedding
    const queryEmbeddings = await this.embeddings.embed([query]);
    const queryVector = queryEmbeddings[0];

    // Calculate similarity scores for all documents
    const scored: KnowledgeSearchResult[] = knowledge.documents.map(
      (doc, index) => ({
        document: doc,
        score: this.cosineSimilarity(queryVector, knowledge.embeddings[index]),
      })
    );

    // Filter by minimum score
    let filtered = scored.filter((item) => item.score >= minScore);

    // Filter by categories if specified
    if (categories && categories.length > 0) {
      filtered = filtered.filter((item) =>
        categories.includes(item.document.category)
      );
    }

    // Sort by score (highest first) and take top K
    return filtered.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  /**
   * Get documents by category without semantic search.
   *
   * @param npcId - Unique identifier for the NPC
   * @param category - The category to filter by
   * @returns Array of documents in that category
   */
  getByCategory(
    npcId: string,
    category: KnowledgeCategory
  ): KnowledgeDocument[] {
    const knowledge = this.knowledgeBases.get(npcId);
    if (!knowledge) return [];

    return knowledge.documents.filter((doc) => doc.category === category);
  }

  /**
   * Get all knowledge documents for an NPC.
   *
   * @param npcId - Unique identifier for the NPC
   * @returns All indexed documents
   */
  getAllKnowledge(npcId: string): KnowledgeDocument[] {
    const knowledge = this.knowledgeBases.get(npcId);
    return knowledge ? [...knowledge.documents] : [];
  }

  /**
   * Check if an NPC has indexed knowledge.
   *
   * @param npcId - Unique identifier for the NPC
   * @returns True if knowledge exists
   */
  hasKnowledge(npcId: string): boolean {
    const knowledge = this.knowledgeBases.get(npcId);
    return knowledge !== undefined && knowledge.documents.length > 0;
  }

  /**
   * Get the number of indexed documents for an NPC.
   *
   * @param npcId - Unique identifier for the NPC
   * @returns Document count
   */
  getDocumentCount(npcId: string): number {
    const knowledge = this.knowledgeBases.get(npcId);
    return knowledge ? knowledge.documents.length : 0;
  }

  /**
   * Clear knowledge for an NPC.
   *
   * @param npcId - Unique identifier for the NPC
   */
  clearKnowledge(npcId: string): void {
    this.knowledgeBases.delete(npcId);
    console.log(`[NpcKnowledge] Cleared knowledge for NPC: ${npcId}`);
  }

  /**
   * Clear all knowledge bases.
   */
  clearAll(): void {
    this.knowledgeBases.clear();
    console.log('[NpcKnowledge] Cleared all knowledge bases');
  }

  /**
   * Calculate cosine similarity between two normalized vectors.
   * For normalized vectors, this equals the dot product.
   *
   * @param a - First vector
   * @param b - Second vector
   * @returns Similarity score between -1 and 1
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
    }
    return dotProduct;
  }
}
