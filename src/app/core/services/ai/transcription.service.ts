import { Injectable, signal, NgZone, inject } from '@angular/core';
import {
  pipeline,
  AutomaticSpeechRecognitionPipeline,
  TranslationPipeline,
} from '@huggingface/transformers';
import { WebGpuService } from './webgpu.service';

export interface TranscriptionResult {
  text: string;
  translation?: string;
  timestamp: Date;
  processingTimeMs: number;
}

/**
 * Available ASR models.
 */
export const ASR_MODELS = {
  whisperTiny: {
    id: 'onnx-community/whisper-tiny',
    size: '~75 MB',
    description: 'Fast, lower quality',
  },
  whisperBase: {
    id: 'onnx-community/whisper-base',
    size: '~150 MB',
    description: 'Balanced speed/quality',
  },
  whisperSmall: {
    id: 'onnx-community/whisper-small',
    size: '~500 MB',
    description: 'Higher quality, slower',
  },
} as const;

/**
 * Available translation models.
 */
export const TRANSLATION_MODELS = {
  esEn: {
    id: 'Xenova/opus-mt-es-en',
    source: 'es',
    target: 'en',
    size: '~45 MB',
  },
  enEs: {
    id: 'Xenova/opus-mt-en-es',
    source: 'en',
    target: 'es',
    size: '~45 MB',
  },
  enFr: {
    id: 'Xenova/opus-mt-en-fr',
    source: 'en',
    target: 'fr',
    size: '~45 MB',
  },
  frEn: {
    id: 'Xenova/opus-mt-fr-en',
    source: 'fr',
    target: 'en',
    size: '~45 MB',
  },
} as const;

/**
 * Service for speech transcription and translation.
 * Uses Whisper for ASR and Helsinki-NLP models for translation.
 */
@Injectable({ providedIn: 'root' })
export class TranscriptionService {
  private transcriber: AutomaticSpeechRecognitionPipeline | null = null;
  private translator: TranslationPipeline | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingInterval: ReturnType<typeof setInterval> | null = null;

  private readonly webGpu = inject(WebGpuService);

  // Signals for reactive state
  readonly isLoading = signal(false);
  readonly loadProgress = signal(0);
  readonly loadStatus = signal('');
  readonly isReady = signal(false);
  readonly isListening = signal(false);
  readonly transcription = signal('');
  readonly translation = signal('');
  readonly results = signal<TranscriptionResult[]>([]);
  readonly currentAsrModel = signal<string | null>(null);
  readonly currentTranslationModel = signal<string | null>(null);

  constructor(private ngZone: NgZone) {}

  /**
   * Initialize the ASR and translation models.
   */
  async initialize(
    asrModel: keyof typeof ASR_MODELS = 'whisperTiny',
    translationModel: keyof typeof TRANSLATION_MODELS | null = 'esEn'
  ): Promise<void> {
    this.isLoading.set(true);
    this.loadProgress.set(0);
    this.loadStatus.set('Loading models...');

    try {
      const device = this.webGpu.getPreferredDevice();

      const progressCallback = (progress: { status?: string; progress?: number }) => {
        this.ngZone.run(() => {
          if (typeof progress.progress === 'number') {
            this.loadProgress.set(Math.round(progress.progress));
          }
          if (progress.status) {
            this.loadStatus.set(progress.status);
          }
        });
      };

      // Load ASR model (Whisper)
      this.loadStatus.set('Loading speech recognition model...');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.transcriber = (await (pipeline as any)(
        'automatic-speech-recognition',
        ASR_MODELS[asrModel].id,
        {
          device,
          progress_callback: progressCallback,
        }
      )) as AutomaticSpeechRecognitionPipeline;
      this.currentAsrModel.set(ASR_MODELS[asrModel].id);

      // Load translation model if specified
      if (translationModel) {
        this.loadStatus.set('Loading translation model...');
        this.loadProgress.set(0);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.translator = (await (pipeline as any)(
          'translation',
          TRANSLATION_MODELS[translationModel].id,
          {
            device: 'wasm', // WASM more stable for small models
            progress_callback: progressCallback,
          }
        )) as TranslationPipeline;
        this.currentTranslationModel.set(TRANSLATION_MODELS[translationModel].id);
      }

      this.isLoading.set(false);
      this.isReady.set(true);
      this.loadStatus.set('Ready');
    } catch (error) {
      this.isLoading.set(false);
      this.loadStatus.set('Failed to load models');
      console.error('Failed to initialize transcription service:', error);
      throw error;
    }
  }

  /**
   * Start listening to microphone and transcribing.
   */
  async startListening(chunkDurationMs: number = 5000): Promise<void> {
    if (!this.transcriber) {
      throw new Error('Transcriber not initialized. Call initialize() first.');
    }

    // Request microphone access
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    this.audioContext = new AudioContext({ sampleRate: 16000 });

    // Use MediaRecorder to capture audio chunks
    this.mediaRecorder = new MediaRecorder(this.mediaStream, {
      mimeType: this.getSupportedMimeType(),
    });

    this.audioChunks = [];

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = async () => {
      if (this.audioChunks.length > 0 && this.isListening()) {
        await this.processAudioChunks();
        this.audioChunks = [];
      }
    };

    this.isListening.set(true);

    // Start recording
    this.mediaRecorder.start();

    // Process audio every chunkDurationMs
    this.recordingInterval = setInterval(() => {
      if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.stop();
        if (this.isListening()) {
          this.mediaRecorder.start();
        }
      }
    }, chunkDurationMs);
  }

  /**
   * Get supported audio MIME type.
   */
  private getSupportedMimeType(): string {
    const types = ['audio/webm', 'audio/mp4', 'audio/ogg'];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return 'audio/webm';
  }

  /**
   * Process recorded audio chunks.
   */
  private async processAudioChunks(): Promise<void> {
    if (this.audioChunks.length === 0 || !this.transcriber) return;

    const startTime = performance.now();

    try {
      // Combine chunks into single blob
      const audioBlob = new Blob(this.audioChunks, {
        type: this.getSupportedMimeType(),
      });

      // Convert to array buffer
      const arrayBuffer = await audioBlob.arrayBuffer();

      // Decode audio
      const audioBuffer = await this.audioContext!.decodeAudioData(arrayBuffer);

      // Get audio data as Float32Array
      const audioData = audioBuffer.getChannelData(0);

      // Resample to 16kHz if needed
      const targetSampleRate = 16000;
      let processedAudio: Float32Array;

      if (audioBuffer.sampleRate !== targetSampleRate) {
        processedAudio = this.resampleAudio(
          audioData,
          audioBuffer.sampleRate,
          targetSampleRate
        );
      } else {
        processedAudio = audioData;
      }

      await this.ngZone.runOutsideAngular(async () => {
        // Transcribe
        const transcriptionResult = await this.transcriber!(processedAudio, {
          language: 'es',
          task: 'transcribe',
          return_timestamps: false,
        });

        const text =
          typeof transcriptionResult === 'object' && 'text' in transcriptionResult
            ? (transcriptionResult.text as string).trim()
            : '';

        if (!text) return;

        this.ngZone.run(() => this.transcription.set(text));

        // Translate if translator is available
        let translatedText = '';
        if (this.translator && text) {
          const translationResult = await this.translator(text);
          translatedText =
            Array.isArray(translationResult)
              ? (translationResult[0] as { translation_text?: string })?.translation_text || ''
              : '';

          this.ngZone.run(() => this.translation.set(translatedText));
        }

        const processingTimeMs = performance.now() - startTime;

        // Add to results
        const result: TranscriptionResult = {
          text,
          translation: translatedText || undefined,
          timestamp: new Date(),
          processingTimeMs,
        };

        this.ngZone.run(() => {
          this.results.update((prev) => [...prev, result]);
        });
      });
    } catch (error) {
      console.error('Error processing audio:', error);
    }
  }

  /**
   * Resample audio to target sample rate.
   */
  private resampleAudio(
    audioData: Float32Array,
    fromRate: number,
    toRate: number
  ): Float32Array {
    const ratio = fromRate / toRate;
    const newLength = Math.round(audioData.length / ratio);
    const result = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, audioData.length - 1);
      const t = srcIndex - srcIndexFloor;

      // Linear interpolation
      result[i] = audioData[srcIndexFloor] * (1 - t) + audioData[srcIndexCeil] * t;
    }

    return result;
  }

  /**
   * Transcribe an audio file.
   */
  async transcribeFile(file: File): Promise<TranscriptionResult> {
    if (!this.transcriber) {
      throw new Error('Transcriber not initialized. Call initialize() first.');
    }

    const startTime = performance.now();

    // Read file as array buffer
    const arrayBuffer = await file.arrayBuffer();

    // Decode audio
    const audioCtx = new AudioContext({ sampleRate: 16000 });
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const audioData = audioBuffer.getChannelData(0);

    // Resample if needed
    let processedAudio: Float32Array;
    if (audioBuffer.sampleRate !== 16000) {
      processedAudio = this.resampleAudio(audioData, audioBuffer.sampleRate, 16000);
    } else {
      processedAudio = audioData;
    }

    await audioCtx.close();

    // Transcribe
    const transcriptionResult = await this.transcriber(processedAudio, {
      language: 'es',
      task: 'transcribe',
    });

    const text =
      typeof transcriptionResult === 'object' && 'text' in transcriptionResult
        ? (transcriptionResult.text as string).trim()
        : '';

    // Translate if available
    let translatedText = '';
    if (this.translator && text) {
      const translationResult = await this.translator(text);
      translatedText =
        Array.isArray(translationResult)
          ? (translationResult[0] as { translation_text?: string })?.translation_text || ''
          : '';
    }

    const processingTimeMs = performance.now() - startTime;

    return {
      text,
      translation: translatedText || undefined,
      timestamp: new Date(),
      processingTimeMs,
    };
  }

  /**
   * Stop listening.
   */
  stopListening(): void {
    this.isListening.set(false);

    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.audioChunks = [];
  }

  /**
   * Clear transcription results.
   */
  clearResults(): void {
    this.results.set([]);
    this.transcription.set('');
    this.translation.set('');
  }

  /**
   * Dispose all resources.
   */
  async dispose(): Promise<void> {
    this.stopListening();
    this.transcriber = null;
    this.translator = null;
    this.isReady.set(false);
    this.currentAsrModel.set(null);
    this.currentTranslationModel.set(null);
    this.clearResults();
  }
}
