import { Component, inject, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  EmbeddingsService,
  EMBEDDING_MODELS,
  SearchResult,
} from '../../core/services/ai/embeddings.service';

// Sample documents for demo
const SAMPLE_DOCUMENTS = [
  { text: "The quick brown fox jumps over the lazy dog.", category: "Animals" },
  { text: "Machine learning models can process vast amounts of data efficiently.", category: "Technology" },
  { text: "WebGPU enables high-performance graphics and compute in the browser.", category: "Technology" },
  { text: "Angular is a platform for building mobile and desktop web applications.", category: "Technology" },
  { text: "The mitochondria is the powerhouse of the cell.", category: "Science" },
  { text: "Photosynthesis converts sunlight into chemical energy in plants.", category: "Science" },
  { text: "Shakespeare wrote Romeo and Juliet in the late 16th century.", category: "Literature" },
  { text: "The Great Wall of China is one of the largest building projects ever undertaken.", category: "History" },
  { text: "Artificial intelligence is transforming how we interact with technology.", category: "Technology" },
  { text: "Neural networks are inspired by the structure of the human brain.", category: "Technology" },
  { text: "Coffee originated in Ethiopia and spread to the rest of the world.", category: "Food" },
  { text: "The ocean covers about 71% of the Earth's surface.", category: "Geography" },
  { text: "Python is a versatile programming language used for many applications.", category: "Technology" },
  { text: "The speed of light is approximately 299,792 kilometers per second.", category: "Science" },
  { text: "Vincent van Gogh painted The Starry Night in 1889.", category: "Art" },
];

@Component({
  selector: 'app-semantic-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="semantic-search">
      <header class="page-header">
        <div class="header-content">
          <h1>Semantic Search</h1>
          <p class="subtitle">Search documents by meaning using vector embeddings</p>
        </div>
        <div class="header-badge">
          <span class="badge badge-info">Transformers.js</span>
          <span class="badge" [class.badge-success]="embeddings.isReady()" [class.badge-warning]="!embeddings.isReady()">
            {{ embeddings.isReady() ? 'Ready' : 'Not loaded' }}
          </span>
        </div>
      </header>

      <div class="content-grid">
        <!-- Setup Panel -->
        <aside class="setup-panel card">
          <h2 class="panel-title">Setup</h2>

          <div class="model-select">
            <label>Embedding Model</label>
            <select
              class="input"
              [(ngModel)]="selectedModel"
              [disabled]="embeddings.isLoading()"
            >
              @for (model of modelOptions; track model.id) {
                <option [value]="model.id">
                  {{ model.name }} ({{ model.dimensions }}d)
                </option>
              }
            </select>
          </div>

          @if (!embeddings.isReady() && !embeddings.isLoading()) {
            <button class="btn btn-primary w-full" (click)="initializeModel()">
              Load Model
            </button>
          }

          @if (embeddings.isLoading()) {
            <div class="loading-state">
              <div class="progress-bar">
                <div class="progress-fill" [style.width.%]="embeddings.loadProgress()"></div>
              </div>
              <p class="loading-text">Loading... {{ embeddings.loadProgress() }}%</p>
            </div>
          }

          @if (embeddings.isReady()) {
            <div class="stats">
              <div class="stat-item">
                <span class="stat-label">Documents</span>
                <span class="stat-value">{{ embeddings.documentCount() }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Model</span>
                <span class="stat-value text-sm">{{ getModelName() }}</span>
              </div>
            </div>

            @if (embeddings.documentCount() === 0) {
              <button class="btn btn-success w-full" (click)="loadSampleDocs()">
                Load Sample Documents
              </button>
            } @else {
              <button class="btn btn-secondary w-full" (click)="clearDocuments()">
                Clear Documents
              </button>
            }
          }

          <div class="divider"></div>

          <h3 class="panel-subtitle">Add Custom Document</h3>
          <textarea
            class="input"
            placeholder="Enter your document text..."
            [(ngModel)]="newDocument"
            [disabled]="!embeddings.isReady() || embeddings.isIndexing()"
            rows="3"
          ></textarea>
          <button
            class="btn btn-secondary w-full"
            [disabled]="!embeddings.isReady() || !newDocument.trim() || embeddings.isIndexing()"
            (click)="addDocument()"
          >
            @if (embeddings.isIndexing()) {
              <span class="spinner"></span>
              Indexing...
            } @else {
              Add Document
            }
          </button>
        </aside>

        <!-- Search Panel -->
        <section class="search-panel card">
          <div class="search-header">
            <div class="search-input-wrapper">
              <input
                type="text"
                class="input search-input"
                placeholder="Search by meaning (e.g., 'how computers learn')"
                [(ngModel)]="searchQuery"
                (keyup.enter)="search()"
                [disabled]="!embeddings.isReady() || embeddings.documentCount() === 0"
              />
              <button
                class="btn btn-primary search-btn"
                (click)="search()"
                [disabled]="!embeddings.isReady() || !searchQuery.trim() || embeddings.isSearching()"
              >
                @if (embeddings.isSearching()) {
                  <span class="spinner"></span>
                } @else {
                  Search
                }
              </button>
            </div>
            <p class="search-hint">
              Try semantic queries like "artificial intelligence" to find related content
            </p>
          </div>

          @if (!embeddings.isReady()) {
            <div class="empty-state">
              <span class="empty-icon">🔍</span>
              <h3>Load the model to start searching</h3>
              <p>Select a model and click "Load Model" to begin.</p>
            </div>
          } @else if (embeddings.documentCount() === 0) {
            <div class="empty-state">
              <span class="empty-icon">📄</span>
              <h3>No documents indexed</h3>
              <p>Load sample documents or add your own to start searching.</p>
            </div>
          } @else if (searchResults().length === 0 && !hasSearched()) {
            <div class="empty-state">
              <span class="empty-icon">🔎</span>
              <h3>Ready to search</h3>
              <p>Enter a query to find semantically similar documents.</p>
            </div>
          } @else if (searchResults().length === 0 && hasSearched()) {
            <div class="empty-state">
              <span class="empty-icon">😕</span>
              <h3>No results found</h3>
              <p>Try a different search query.</p>
            </div>
          } @else {
            <div class="results-list">
              <h3 class="results-title">Results for "{{ lastQuery() }}"</h3>
              @for (result of searchResults(); track result.index) {
                <div class="result-card">
                  <div class="result-header">
                    <span class="result-score" [class.high]="result.score > 0.6" [class.medium]="result.score > 0.3 && result.score <= 0.6">
                      {{ (result.score * 100).toFixed(1) }}% match
                    </span>
                    @if (result.metadata?.['category']) {
                      <span class="result-category">{{ result.metadata?.['category'] }}</span>
                    }
                  </div>
                  <p class="result-text">{{ result.text }}</p>
                </div>
              }
            </div>
          }
        </section>
      </div>
    </div>
  `,
  styles: [`
    .semantic-search {
      padding: 1.5rem;
      height: 100%;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1.5rem;
    }

    .header-content h1 {
      font-size: 1.75rem;
      font-weight: 700;
      margin-bottom: 0.25rem;
    }

    .subtitle {
      color: var(--text-secondary);
      font-size: 0.875rem;
    }

    .header-badge {
      display: flex;
      gap: 0.5rem;
    }

    .content-grid {
      display: grid;
      grid-template-columns: 300px 1fr;
      gap: 1.5rem;
    }

    .setup-panel {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      height: fit-content;
    }

    .panel-title {
      font-size: 1rem;
      font-weight: 600;
    }

    .panel-subtitle {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--text-secondary);
    }

    .model-select {
      label {
        display: block;
        font-size: 0.875rem;
        font-weight: 500;
        margin-bottom: 0.5rem;
        color: var(--text-secondary);
      }
    }

    .loading-state {
      margin-top: 0.5rem;
    }

    .loading-text {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 0.5rem;
      text-align: center;
    }

    .stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
      padding: 0.75rem;
      background: var(--bg-tertiary);
      border-radius: var(--radius-md);
    }

    .stat-item {
      text-align: center;
    }

    .stat-label {
      display: block;
      font-size: 0.7rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .stat-value {
      display: block;
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--text-primary);

      &.text-sm {
        font-size: 0.75rem;
        font-weight: 500;
      }
    }

    .divider {
      height: 1px;
      background: var(--border-color);
      margin: 0.5rem 0;
    }

    .search-panel {
      display: flex;
      flex-direction: column;
    }

    .search-header {
      margin-bottom: 1.5rem;
    }

    .search-input-wrapper {
      display: flex;
      gap: 0.75rem;
    }

    .search-input {
      flex: 1;
    }

    .search-btn {
      min-width: 100px;
    }

    .search-hint {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 0.5rem;
    }

    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 3rem;
      min-height: 300px;

      .empty-icon {
        font-size: 4rem;
        margin-bottom: 1rem;
      }

      h3 {
        font-size: 1.25rem;
        margin-bottom: 0.5rem;
      }

      p {
        color: var(--text-muted);
        max-width: 300px;
      }
    }

    .results-list {
      flex: 1;
      overflow-y: auto;
    }

    .results-title {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--text-secondary);
      margin-bottom: 1rem;
    }

    .result-card {
      background: var(--bg-tertiary);
      border-radius: var(--radius-md);
      padding: 1rem;
      margin-bottom: 0.75rem;

      &:last-child {
        margin-bottom: 0;
      }
    }

    .result-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.5rem;
    }

    .result-score {
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.25rem 0.5rem;
      border-radius: var(--radius-sm);
      background: rgba(239, 68, 68, 0.2);
      color: var(--danger-color);

      &.medium {
        background: rgba(245, 158, 11, 0.2);
        color: var(--accent-color);
      }

      &.high {
        background: rgba(16, 185, 129, 0.2);
        color: var(--secondary-color);
      }
    }

    .result-category {
      font-size: 0.7rem;
      padding: 0.2rem 0.4rem;
      background: var(--bg-secondary);
      border-radius: var(--radius-sm);
      color: var(--text-muted);
    }

    .result-text {
      color: var(--text-primary);
      line-height: 1.5;
    }

    @media (max-width: 768px) {
      .content-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class SemanticSearchComponent implements OnDestroy {
  readonly embeddings = inject(EmbeddingsService);

  selectedModel = EMBEDDING_MODELS.miniLM.id;
  searchQuery = '';
  newDocument = '';

  readonly searchResults = signal<SearchResult[]>([]);
  readonly hasSearched = signal(false);
  readonly lastQuery = signal('');

  readonly modelOptions = [
    {
      id: EMBEDDING_MODELS.miniLM.id,
      name: 'MiniLM',
      dimensions: EMBEDDING_MODELS.miniLM.dimensions,
    },
    {
      id: EMBEDDING_MODELS.bgeSmall.id,
      name: 'BGE Small',
      dimensions: EMBEDDING_MODELS.bgeSmall.dimensions,
    },
  ];

  getModelName(): string {
    const model = this.modelOptions.find((m) => m.id === this.embeddings.currentModel());
    return model?.name || 'Unknown';
  }

  async initializeModel(): Promise<void> {
    await this.embeddings.initialize(this.selectedModel);
  }

  async loadSampleDocs(): Promise<void> {
    const docs = SAMPLE_DOCUMENTS.map((doc) => ({
      text: doc.text,
      metadata: { category: doc.category },
    }));
    await this.embeddings.indexDocuments(docs);
  }

  async addDocument(): Promise<void> {
    const text = this.newDocument.trim();
    if (!text) return;

    await this.embeddings.addDocuments([{ text }]);
    this.newDocument = '';
  }

  clearDocuments(): void {
    this.embeddings.clearIndex();
    this.searchResults.set([]);
    this.hasSearched.set(false);
  }

  async search(): Promise<void> {
    const query = this.searchQuery.trim();
    if (!query) return;

    this.hasSearched.set(true);
    this.lastQuery.set(query);

    const results = await this.embeddings.search(query, 5);
    this.searchResults.set(results);
  }

  async ngOnDestroy(): Promise<void> {
    await this.embeddings.dispose();
  }
}
