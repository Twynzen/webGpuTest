import { Component, inject, OnDestroy, signal, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  TranscriptionService,
  ASR_MODELS,
  TRANSLATION_MODELS,
  TranscriptionResult,
} from '../../core/services/ai/transcription.service';

@Component({
  selector: 'app-live-translator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="live-translator">
      <header class="page-header">
        <div class="header-content">
          <h1>Live Translator</h1>
          <p class="subtitle">Real-time speech transcription and translation</p>
        </div>
        <div class="header-badge">
          <span class="badge badge-info">Whisper + Helsinki-NLP</span>
          <span class="badge" [class.badge-success]="transcription.isReady()" [class.badge-warning]="!transcription.isReady()">
            {{ transcription.isReady() ? 'Ready' : 'Not loaded' }}
          </span>
        </div>
      </header>

      <div class="content-grid">
        <!-- Config Panel -->
        <aside class="config-panel card">
          <h2 class="panel-title">Configuration</h2>

          <div class="config-section">
            <label>Speech Recognition Model</label>
            <select
              class="input"
              [(ngModel)]="selectedAsrModel"
              [disabled]="transcription.isLoading() || transcription.isListening()"
            >
              @for (model of asrModelOptions; track model.key) {
                <option [value]="model.key">{{ model.name }}</option>
              }
            </select>
            <p class="config-hint">{{ getAsrModelDesc() }}</p>
          </div>

          <div class="config-section">
            <label>Translation</label>
            <select
              class="input"
              [(ngModel)]="selectedTranslationModel"
              [disabled]="transcription.isLoading() || transcription.isListening()"
            >
              <option [value]="null">No translation</option>
              @for (model of translationModelOptions; track model.key) {
                <option [value]="model.key">{{ model.name }}</option>
              }
            </select>
          </div>

          @if (!transcription.isReady() && !transcription.isLoading()) {
            <button class="btn btn-primary w-full" (click)="loadModels()">
              Load Models
            </button>
          }

          @if (transcription.isLoading()) {
            <div class="loading-state">
              <div class="progress-bar">
                <div class="progress-fill" [style.width.%]="transcription.loadProgress()"></div>
              </div>
              <p class="loading-text">{{ transcription.loadStatus() }}</p>
            </div>
          }

          @if (transcription.isReady()) {
            <div class="mic-controls">
              @if (!transcription.isListening()) {
                <button class="btn btn-success w-full mic-btn" (click)="startListening()">
                  <span class="mic-icon">🎙️</span>
                  Start Recording
                </button>
              } @else {
                <button class="btn btn-danger w-full mic-btn recording" (click)="stopListening()">
                  <span class="mic-icon pulse">🔴</span>
                  Stop Recording
                </button>
              }
            </div>

            <div class="divider"></div>

            <div class="file-upload">
              <label>Or upload an audio file</label>
              <input
                type="file"
                #fileInput
                accept="audio/*"
                (change)="onFileSelected($event)"
                hidden
              />
              <button
                class="btn btn-secondary w-full"
                (click)="fileInput.click()"
                [disabled]="transcription.isListening() || isProcessingFile()"
              >
                @if (isProcessingFile()) {
                  <span class="spinner"></span>
                  Processing...
                } @else {
                  Upload Audio
                }
              </button>
            </div>
          }

          @if (transcription.results().length > 0) {
            <button class="btn btn-secondary w-full" (click)="clearResults()">
              Clear Results
            </button>
          }
        </aside>

        <!-- Transcription Panel -->
        <section class="transcription-panel">
          <!-- Live Transcription -->
          <div class="live-section card">
            <div class="section-header">
              <h3>Live Transcription</h3>
              @if (transcription.isListening()) {
                <span class="listening-indicator">
                  <span class="pulse-dot"></span>
                  Listening...
                </span>
              }
            </div>

            <div class="transcription-box">
              @if (transcription.transcription()) {
                <p class="original-text">{{ transcription.transcription() }}</p>
              } @else {
                <p class="placeholder-text">
                  {{ transcription.isListening() ? 'Speak now...' : 'Start recording to see transcription' }}
                </p>
              }
            </div>

            @if (selectedTranslationModel) {
              <div class="translation-box">
                <span class="translation-label">Translation:</span>
                @if (transcription.translation()) {
                  <p class="translated-text">{{ transcription.translation() }}</p>
                } @else {
                  <p class="placeholder-text">
                    {{ transcription.isListening() ? 'Translation will appear here...' : '' }}
                  </p>
                }
              </div>
            }
          </div>

          <!-- History -->
          <div class="history-section card">
            <h3>History</h3>

            @if (transcription.results().length === 0) {
              <div class="empty-history">
                <p>No transcriptions yet</p>
              </div>
            } @else {
              <div class="results-list">
                @for (result of transcription.results().slice().reverse(); track result.timestamp.getTime()) {
                  <div class="result-item">
                    <div class="result-header">
                      <span class="result-time">{{ result.timestamp | date:'HH:mm:ss' }}</span>
                      <span class="result-duration">{{ result.processingTimeMs.toFixed(0) }}ms</span>
                    </div>
                    <p class="result-text">{{ result.text }}</p>
                    @if (result.translation) {
                      <p class="result-translation">{{ result.translation }}</p>
                    }
                  </div>
                }
              </div>
            }
          </div>
        </section>
      </div>
    </div>
  `,
  styles: [`
    .live-translator {
      padding: 1.5rem;
      height: 100%;
      display: flex;
      flex-direction: column;
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
      flex: 1;
      min-height: 0;
    }

    .config-panel {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      height: fit-content;
    }

    .panel-title {
      font-size: 1rem;
      font-weight: 600;
    }

    .config-section {
      label {
        display: block;
        font-size: 0.875rem;
        font-weight: 500;
        margin-bottom: 0.5rem;
        color: var(--text-secondary);
      }
    }

    .config-hint {
      font-size: 0.7rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
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

    .mic-controls {
      margin-top: 0.5rem;
    }

    .mic-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 1rem;
      font-size: 1rem;

      &.recording {
        animation: pulse-bg 1.5s infinite;
      }
    }

    .mic-icon {
      font-size: 1.25rem;

      &.pulse {
        animation: pulse 1s infinite;
      }
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    @keyframes pulse-bg {
      0%, 100% { background: var(--danger-color); }
      50% { background: #b91c1c; }
    }

    .divider {
      height: 1px;
      background: var(--border-color);
      margin: 0.5rem 0;
    }

    .file-upload {
      label {
        display: block;
        font-size: 0.875rem;
        font-weight: 500;
        margin-bottom: 0.5rem;
        color: var(--text-secondary);
      }
    }

    .transcription-panel {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      min-height: 0;
    }

    .live-section {
      flex-shrink: 0;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;

      h3 {
        font-size: 1rem;
        font-weight: 600;
      }
    }

    .listening-indicator {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8rem;
      color: var(--secondary-color);
    }

    .pulse-dot {
      width: 8px;
      height: 8px;
      background: var(--secondary-color);
      border-radius: 50%;
      animation: pulse 1s infinite;
    }

    .transcription-box {
      background: var(--bg-tertiary);
      border-radius: var(--radius-md);
      padding: 1rem;
      min-height: 80px;
    }

    .original-text {
      font-size: 1.125rem;
      line-height: 1.6;
    }

    .placeholder-text {
      color: var(--text-muted);
      font-style: italic;
    }

    .translation-box {
      margin-top: 1rem;
      padding: 1rem;
      background: rgba(99, 102, 241, 0.1);
      border-radius: var(--radius-md);
      border-left: 3px solid var(--primary-color);
    }

    .translation-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      display: block;
      margin-bottom: 0.5rem;
    }

    .translated-text {
      font-size: 1.125rem;
      color: var(--primary-color);
    }

    .history-section {
      flex: 1;
      min-height: 200px;
      display: flex;
      flex-direction: column;

      h3 {
        font-size: 1rem;
        font-weight: 600;
        margin-bottom: 1rem;
      }
    }

    .empty-history {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-muted);
    }

    .results-list {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .result-item {
      background: var(--bg-tertiary);
      border-radius: var(--radius-md);
      padding: 0.75rem;
    }

    .result-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .result-time {
      font-size: 0.7rem;
      color: var(--text-muted);
    }

    .result-duration {
      font-size: 0.65rem;
      color: var(--text-muted);
      padding: 0.125rem 0.375rem;
      background: var(--bg-secondary);
      border-radius: var(--radius-sm);
    }

    .result-text {
      font-size: 0.875rem;
      line-height: 1.5;
    }

    .result-translation {
      margin-top: 0.5rem;
      padding-top: 0.5rem;
      border-top: 1px solid var(--border-color);
      font-size: 0.875rem;
      color: var(--primary-color);
      font-style: italic;
    }

    @media (max-width: 768px) {
      .content-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class LiveTranslatorComponent implements OnDestroy {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  readonly transcription = inject(TranscriptionService);

  selectedAsrModel: keyof typeof ASR_MODELS = 'whisperTiny';
  selectedTranslationModel: keyof typeof TRANSLATION_MODELS | null = 'esEn';

  readonly isProcessingFile = signal(false);

  readonly asrModelOptions = [
    { key: 'whisperTiny' as const, name: 'Whisper Tiny (~75 MB)', desc: 'Fast, lower quality' },
    { key: 'whisperBase' as const, name: 'Whisper Base (~150 MB)', desc: 'Balanced speed/quality' },
    { key: 'whisperSmall' as const, name: 'Whisper Small (~500 MB)', desc: 'Higher quality, slower' },
  ];

  readonly translationModelOptions = [
    { key: 'esEn' as const, name: 'Spanish to English' },
    { key: 'enEs' as const, name: 'English to Spanish' },
    { key: 'enFr' as const, name: 'English to French' },
    { key: 'frEn' as const, name: 'French to English' },
  ];

  getAsrModelDesc(): string {
    const model = this.asrModelOptions.find((m) => m.key === this.selectedAsrModel);
    return model?.desc || '';
  }

  async loadModels(): Promise<void> {
    await this.transcription.initialize(
      this.selectedAsrModel,
      this.selectedTranslationModel
    );
  }

  async startListening(): Promise<void> {
    await this.transcription.startListening(5000); // 5 second chunks
  }

  stopListening(): void {
    this.transcription.stopListening();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    this.isProcessingFile.set(true);

    try {
      const result = await this.transcription.transcribeFile(file);
      // The result is automatically added to results in the service
      this.transcription.transcription.set(result.text);
      if (result.translation) {
        this.transcription.translation.set(result.translation);
      }
    } catch (error) {
      console.error('Error processing file:', error);
    } finally {
      this.isProcessingFile.set(false);
      input.value = '';
    }
  }

  clearResults(): void {
    this.transcription.clearResults();
  }

  async ngOnDestroy(): Promise<void> {
    await this.transcription.dispose();
  }
}
