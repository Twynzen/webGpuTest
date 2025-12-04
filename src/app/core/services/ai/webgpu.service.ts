import { Injectable, signal } from '@angular/core';

export interface WebGPUCapabilities {
  available: boolean;
  shaderF16: boolean;
  maxBufferSize: number;
  adapterInfo?: GPUAdapterInfo;
}

/**
 * Service for WebGPU device management and capability detection.
 * Provides centralized WebGPU availability checking with fallback detection.
 */
@Injectable({ providedIn: 'root' })
export class WebGpuService {
  private _isAvailable = signal(false);
  private _capabilities = signal<WebGPUCapabilities>({
    available: false,
    shaderF16: false,
    maxBufferSize: 0,
  });

  readonly isAvailable = this._isAvailable.asReadonly();
  readonly capabilities = this._capabilities.asReadonly();

  /**
   * Check WebGPU availability and gather device capabilities.
   * Should be called once during app initialization.
   */
  async checkAvailability(): Promise<boolean> {
    if (!('gpu' in navigator)) {
      this._isAvailable.set(false);
      return false;
    }

    try {
      const gpu = navigator.gpu as GPU;
      const adapter = await gpu.requestAdapter();

      if (!adapter) {
        this._isAvailable.set(false);
        return false;
      }

      // Get adapter info if available (optional method in some browsers)
      let adapterInfo: GPUAdapterInfo | undefined;
      if ('info' in adapter) {
        adapterInfo = (adapter as GPUAdapter & { info?: GPUAdapterInfo }).info;
      }

      const capabilities: WebGPUCapabilities = {
        available: true,
        shaderF16: adapter.features.has('shader-f16'),
        maxBufferSize: adapter.limits.maxStorageBufferBindingSize,
        adapterInfo,
      };

      this._capabilities.set(capabilities);
      this._isAvailable.set(true);
      return true;
    } catch (error) {
      console.warn('WebGPU check failed:', error);
      this._isAvailable.set(false);
      return false;
    }
  }

  /**
   * Get the preferred AI device type based on WebGPU availability.
   */
  getPreferredDevice(): 'webgpu' | 'wasm' {
    return this._isAvailable() ? 'webgpu' : 'wasm';
  }

  /**
   * Request a WebGPU device with specific features.
   */
  async requestDevice(features?: GPUFeatureName[]): Promise<GPUDevice | null> {
    if (!this._isAvailable()) return null;

    try {
      const gpu = navigator.gpu as GPU;
      const adapter = await gpu.requestAdapter();

      if (!adapter) return null;

      const requiredFeatures: GPUFeatureName[] = [];
      if (features) {
        for (const feature of features) {
          if (adapter.features.has(feature)) {
            requiredFeatures.push(feature);
          }
        }
      }

      return await adapter.requestDevice({
        requiredFeatures,
      });
    } catch (error) {
      console.error('Failed to request WebGPU device:', error);
      return null;
    }
  }
}
