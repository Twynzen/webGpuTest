import { Component, inject, OnDestroy, signal, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VisionService, VISION_MODELS, ProcessingResult } from '../../core/services/ai/vision.service';

@Component({
  selector: 'app-object-remover',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="object-remover">
      <header class="page-header">
        <div class="header-content">
          <h1>Object Remover</h1>
          <p class="subtitle">Remove backgrounds from images using AI segmentation</p>
        </div>
        <div class="header-badge">
          <span class="badge badge-info">Transformers.js</span>
          <span class="badge" [class.badge-success]="vision.isReady()" [class.badge-warning]="!vision.isReady()">
            {{ vision.isReady() ? 'Ready' : 'Not loaded' }}
          </span>
        </div>
      </header>

      <div class="content-grid">
        <!-- Controls Panel -->
        <aside class="controls-panel card">
          <h2 class="panel-title">Model</h2>

          <div class="model-select">
            <select
              class="input"
              [(ngModel)]="selectedModel"
              [disabled]="vision.isLoading()"
            >
              @for (model of modelOptions; track model.key) {
                <option [value]="model.key">{{ model.name }}</option>
              }
            </select>
            <p class="model-desc">{{ getModelDescription() }}</p>
          </div>

          @if (!vision.isReady() && !vision.isLoading()) {
            <button class="btn btn-primary w-full" (click)="loadModel()">
              Load Model
            </button>
          }

          @if (vision.isLoading()) {
            <div class="loading-state">
              <div class="progress-bar">
                <div class="progress-fill" [style.width.%]="vision.loadProgress()"></div>
              </div>
              <p class="loading-text">{{ vision.loadStatus() }}</p>
            </div>
          }

          @if (vision.isReady()) {
            <div class="upload-section">
              <input
                type="file"
                #fileInput
                accept="image/*"
                (change)="onFileSelected($event)"
                hidden
              />
              <button
                class="btn btn-success w-full"
                (click)="fileInput.click()"
                [disabled]="vision.isProcessing()"
              >
                Select Image
              </button>
            </div>
          }

          @if (result()) {
            <div class="result-actions">
              <button class="btn btn-primary w-full" (click)="downloadResult()">
                Download Result
              </button>
              <p class="processing-time">
                Processed in {{ result()!.processingTimeMs.toFixed(0) }}ms
              </p>
            </div>
          }
        </aside>

        <!-- Preview Panel -->
        <section class="preview-panel card">
          @if (!vision.isReady()) {
            <div class="empty-state">
              <span class="empty-icon">✂️</span>
              <h3>Load the model to start</h3>
              <p>Select a model and click "Load Model" to begin removing backgrounds.</p>
            </div>
          } @else if (!originalImage() && !vision.isProcessing()) {
            <div class="empty-state">
              <span class="empty-icon">📷</span>
              <h3>No image selected</h3>
              <p>Click "Select Image" to upload an image for background removal.</p>
            </div>
          } @else {
            <div class="preview-container">
              <!-- Original Image -->
              <div class="preview-section">
                <h3 class="preview-label">Original</h3>
                <div class="image-container" [class.loading]="vision.isProcessing()">
                  @if (originalImage()) {
                    <img [src]="originalImage()" alt="Original image" />
                  }
                  @if (vision.isProcessing()) {
                    <div class="processing-overlay">
                      <div class="spinner"></div>
                      <p>Processing...</p>
                    </div>
                  }
                </div>
              </div>

              <!-- Result Image -->
              <div class="preview-section">
                <h3 class="preview-label">Result</h3>
                <div class="image-container checkerboard">
                  @if (resultImage()) {
                    <img [src]="resultImage()" alt="Result image" />
                  } @else if (!vision.isProcessing()) {
                    <div class="placeholder">
                      <span>Result will appear here</span>
                    </div>
                  }
                </div>
              </div>
            </div>
          }
        </section>
      </div>
    </div>
  `,
  styles: [`
    .object-remover {
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
      grid-template-columns: 280px 1fr;
      gap: 1.5rem;
    }

    .controls-panel {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      height: fit-content;
    }

    .panel-title {
      font-size: 1rem;
      font-weight: 600;
    }

    .model-select {
      .input {
        margin-bottom: 0.5rem;
      }
    }

    .model-desc {
      font-size: 0.75rem;
      color: var(--text-muted);
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

    .upload-section {
      margin-top: 0.5rem;
    }

    .result-actions {
      margin-top: 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .processing-time {
      font-size: 0.75rem;
      color: var(--text-muted);
      text-align: center;
    }

    .preview-panel {
      display: flex;
      flex-direction: column;
      min-height: 500px;
    }

    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 3rem;

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

    .preview-container {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
      padding: 0.5rem;
    }

    .preview-section {
      display: flex;
      flex-direction: column;
    }

    .preview-label {
      font-size: 0.875rem;
      font-weight: 500;
      margin-bottom: 0.75rem;
      color: var(--text-secondary);
    }

    .image-container {
      position: relative;
      aspect-ratio: 4 / 3;
      background: var(--bg-tertiary);
      border-radius: var(--radius-md);
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;

      &.checkerboard {
        background-image:
          linear-gradient(45deg, #2a2a2a 25%, transparent 25%),
          linear-gradient(-45deg, #2a2a2a 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, #2a2a2a 75%),
          linear-gradient(-45deg, transparent 75%, #2a2a2a 75%);
        background-size: 20px 20px;
        background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
        background-color: #1a1a1a;
      }

      &.loading {
        opacity: 0.7;
      }

      img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }
    }

    .processing-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;

      p {
        color: white;
        font-size: 0.875rem;
      }
    }

    .placeholder {
      color: var(--text-muted);
      font-size: 0.875rem;
    }

    @media (max-width: 900px) {
      .content-grid {
        grid-template-columns: 1fr;
      }

      .preview-container {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class ObjectRemoverComponent implements OnDestroy {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  readonly vision = inject(VisionService);

  selectedModel: keyof typeof VISION_MODELS = 'rmbg';

  readonly originalImage = signal<string | null>(null);
  readonly resultImage = signal<string | null>(null);
  readonly result = signal<ProcessingResult | null>(null);

  readonly modelOptions = [
    { key: 'rmbg' as const, name: 'RMBG 1.4', desc: 'High quality background removal (~176 MB)' },
    { key: 'modnet' as const, name: 'MODNet', desc: 'Fast portrait matting (~25 MB)' },
  ];

  getModelDescription(): string {
    const model = this.modelOptions.find((m) => m.key === this.selectedModel);
    return model?.desc || '';
  }

  async loadModel(): Promise<void> {
    await this.vision.initialize(this.selectedModel);
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    // Reset previous results
    this.resultImage.set(null);
    this.result.set(null);

    // Load original image preview
    const originalUrl = URL.createObjectURL(file);
    this.originalImage.set(originalUrl);

    // Process image
    try {
      const processingResult = await this.vision.removeBackground(file);
      this.result.set(processingResult);

      // Create result preview URL
      const resultUrl = this.vision.createPreviewUrl(processingResult);
      this.resultImage.set(resultUrl);
    } catch (error) {
      console.error('Error processing image:', error);
    }

    // Reset file input
    input.value = '';
  }

  downloadResult(): void {
    const processingResult = this.result();
    if (processingResult) {
      this.vision.downloadResult(processingResult, 'removed-background.png');
    }
  }

  ngOnDestroy(): void {
    // Cleanup URLs
    const original = this.originalImage();
    const result = this.resultImage();

    if (original) URL.revokeObjectURL(original);
    if (result) URL.revokeObjectURL(result);

    this.vision.dispose();
  }
}
