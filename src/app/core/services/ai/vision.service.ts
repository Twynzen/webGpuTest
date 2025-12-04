import { Injectable, signal, NgZone, inject } from '@angular/core';
import { env, AutoModel, AutoProcessor, RawImage, PreTrainedModel, Processor } from '@huggingface/transformers';
import { WebGpuService } from './webgpu.service';

export interface ProcessingResult {
  blob: Blob;
  width: number;
  height: number;
  processingTimeMs: number;
}

/**
 * Available background removal models.
 * Using Transformers.js models for easier loading without manual ONNX download.
 */
export const VISION_MODELS = {
  rmbg: {
    id: 'briaai/RMBG-1.4',
    size: '~176 MB',
    description: 'High quality background removal',
    inputSize: [1024, 1024] as [number, number],
  },
  modnet: {
    id: 'Xenova/modnet',
    size: '~25 MB',
    description: 'Fast portrait matting',
    inputSize: [512, 512] as [number, number],
  },
} as const;

/**
 * Service for image processing and background removal.
 * Uses Transformers.js with WebGPU acceleration for segmentation models.
 */
@Injectable({ providedIn: 'root' })
export class VisionService {
  private model: PreTrainedModel | null = null;
  private processor: Processor | null = null;
  private currentModelConfig: typeof VISION_MODELS[keyof typeof VISION_MODELS] | null = null;

  private readonly webGpu = inject(WebGpuService);

  // Signals for reactive state
  readonly isLoading = signal(false);
  readonly loadProgress = signal(0);
  readonly loadStatus = signal('');
  readonly isReady = signal(false);
  readonly isProcessing = signal(false);
  readonly currentModel = signal<string | null>(null);

  constructor(private ngZone: NgZone) {}

  /**
   * Initialize the background removal model.
   */
  async initialize(modelKey: keyof typeof VISION_MODELS = 'rmbg'): Promise<void> {
    const modelConfig = VISION_MODELS[modelKey];

    if (this.model && this.currentModel() === modelConfig.id) {
      return; // Already initialized
    }

    this.isLoading.set(true);
    this.loadProgress.set(0);
    this.loadStatus.set('Loading model...');

    try {
      const device = this.webGpu.getPreferredDevice();

      // Configure environment
      env.allowLocalModels = false;

      // Load model and processor
      const [model, processor] = await Promise.all([
        AutoModel.from_pretrained(modelConfig.id, {
          device,
          progress_callback: (progress: { progress?: number; status?: string }) => {
            this.ngZone.run(() => {
              if (progress.progress) {
                this.loadProgress.set(Math.round(progress.progress));
              }
              if (progress.status) {
                this.loadStatus.set(progress.status);
              }
            });
          },
        }),
        AutoProcessor.from_pretrained(modelConfig.id),
      ]);

      this.model = model;
      this.processor = processor;
      this.currentModelConfig = modelConfig;

      this.currentModel.set(modelConfig.id);
      this.isLoading.set(false);
      this.isReady.set(true);
      this.loadStatus.set('Ready');
    } catch (error) {
      this.isLoading.set(false);
      this.loadStatus.set('Failed to load model');
      console.error('Failed to initialize vision model:', error);
      throw error;
    }
  }

  /**
   * Remove background from an image.
   */
  async removeBackground(
    imageSource: HTMLImageElement | File | Blob | string
  ): Promise<ProcessingResult> {
    if (!this.model || !this.processor) {
      throw new Error('Model not initialized. Call initialize() first.');
    }

    this.isProcessing.set(true);
    const startTime = performance.now();

    try {
      return await this.ngZone.runOutsideAngular(async () => {
        // Load image
        let image: RawImage;
        if (typeof imageSource === 'string') {
          image = await RawImage.fromURL(imageSource);
        } else if (imageSource instanceof HTMLImageElement) {
          image = await RawImage.fromURL(imageSource.src);
        } else {
          // File or Blob
          const url = URL.createObjectURL(imageSource);
          try {
            image = await RawImage.fromURL(url);
          } finally {
            URL.revokeObjectURL(url);
          }
        }

        const originalWidth = image.width;
        const originalHeight = image.height;

        // Process image through model
        const { pixel_values } = await this.processor!(image);
        const { output } = await this.model!({ input: pixel_values });

        // Post-process mask
        const maskData = output.data as Float32Array;
        const maskWidth = output.dims[3];
        const maskHeight = output.dims[2];

        // Create output canvas at original resolution
        const canvas = document.createElement('canvas');
        canvas.width = originalWidth;
        canvas.height = originalHeight;
        const ctx = canvas.getContext('2d')!;

        // Draw original image
        const imgCanvas = document.createElement('canvas');
        imgCanvas.width = originalWidth;
        imgCanvas.height = originalHeight;
        const imgCtx = imgCanvas.getContext('2d')!;

        // Convert RawImage to canvas
        const imageData = imgCtx.createImageData(originalWidth, originalHeight);
        const rgbaData = image.rgba().data;
        imageData.data.set(rgbaData);
        imgCtx.putImageData(imageData, 0, 0);

        ctx.drawImage(imgCanvas, 0, 0);

        // Get image data and apply mask
        const outputImageData = ctx.getImageData(0, 0, originalWidth, originalHeight);

        // Apply mask with bilinear interpolation
        for (let y = 0; y < originalHeight; y++) {
          for (let x = 0; x < originalWidth; x++) {
            // Map to mask coordinates
            const maskX = (x / originalWidth) * maskWidth;
            const maskY = (y / originalHeight) * maskHeight;

            // Bilinear interpolation
            const x0 = Math.floor(maskX);
            const y0 = Math.floor(maskY);
            const x1 = Math.min(x0 + 1, maskWidth - 1);
            const y1 = Math.min(y0 + 1, maskHeight - 1);

            const fx = maskX - x0;
            const fy = maskY - y0;

            const v00 = maskData[y0 * maskWidth + x0];
            const v10 = maskData[y0 * maskWidth + x1];
            const v01 = maskData[y1 * maskWidth + x0];
            const v11 = maskData[y1 * maskWidth + x1];

            const maskValue =
              v00 * (1 - fx) * (1 - fy) +
              v10 * fx * (1 - fy) +
              v01 * (1 - fx) * fy +
              v11 * fx * fy;

            // Apply sigmoid and set alpha
            const alpha = 1 / (1 + Math.exp(-maskValue));
            const pixelIdx = (y * originalWidth + x) * 4;
            outputImageData.data[pixelIdx + 3] = Math.round(alpha * 255);
          }
        }

        ctx.putImageData(outputImageData, 0, 0);

        // Convert to blob
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b!), 'image/png');
        });

        const processingTimeMs = performance.now() - startTime;

        return {
          blob,
          width: originalWidth,
          height: originalHeight,
          processingTimeMs,
        };
      });
    } finally {
      this.ngZone.run(() => {
        this.isProcessing.set(false);
      });
    }
  }

  /**
   * Create a preview URL from a processing result.
   * Remember to revoke the URL when done.
   */
  createPreviewUrl(result: ProcessingResult): string {
    return URL.createObjectURL(result.blob);
  }

  /**
   * Download the processed image.
   */
  downloadResult(result: ProcessingResult, filename: string = 'removed-bg.png'): void {
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Dispose the model and free resources.
   */
  async dispose(): Promise<void> {
    if (this.model) {
      await this.model.dispose?.();
      this.model = null;
    }
    this.processor = null;
    this.currentModelConfig = null;
    this.isReady.set(false);
    this.currentModel.set(null);
  }
}
