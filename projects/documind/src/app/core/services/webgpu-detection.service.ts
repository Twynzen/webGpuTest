import { Injectable, signal } from '@angular/core';

export interface WebGPUCapabilities {
  supported: boolean;
  hasShaderF16: boolean;
  maxBufferSize?: number;
  adapterInfo?: GPUAdapterInfo;
  reason?: string;
}

export interface StorageEstimate {
  quota: number;
  usage: number;
  available: number;
  percentUsed: number;
}

@Injectable({ providedIn: 'root' })
export class WebGPUDetectionService {
  readonly capabilities = signal<WebGPUCapabilities | null>(null);
  readonly storageEstimate = signal<StorageEstimate | null>(null);
  readonly isChecking = signal(false);

  async checkCapabilities(): Promise<WebGPUCapabilities> {
    this.isChecking.set(true);

    try {
      // Check secure context
      if (!window.isSecureContext) {
        const result: WebGPUCapabilities = {
          supported: false,
          hasShaderF16: false,
          reason: 'WebGPU requiere HTTPS. Por favor, accede desde una conexión segura.'
        };
        this.capabilities.set(result);
        return result;
      }

      // Check WebGPU availability
      if (!navigator.gpu) {
        const result: WebGPUCapabilities = {
          supported: false,
          hasShaderF16: false,
          reason: 'WebGPU no está disponible en este navegador. Usa Chrome 113+, Edge 113+, o Safari 26+.'
        };
        this.capabilities.set(result);
        return result;
      }

      // Request GPU adapter
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        const result: WebGPUCapabilities = {
          supported: false,
          hasShaderF16: false,
          reason: 'No se encontró un adaptador GPU compatible. Verifica que tu GPU soporte WebGPU.'
        };
        this.capabilities.set(result);
        return result;
      }

      // Get adapter info
      const adapterInfo = await adapter.requestAdapterInfo();

      const result: WebGPUCapabilities = {
        supported: true,
        hasShaderF16: adapter.features.has('shader-f16'),
        maxBufferSize: adapter.limits.maxBufferSize,
        adapterInfo
      };

      this.capabilities.set(result);
      return result;
    } catch (error) {
      const result: WebGPUCapabilities = {
        supported: false,
        hasShaderF16: false,
        reason: `Error al detectar WebGPU: ${error instanceof Error ? error.message : 'Error desconocido'}`
      };
      this.capabilities.set(result);
      return result;
    } finally {
      this.isChecking.set(false);
    }
  }

  async checkStorageQuota(): Promise<StorageEstimate> {
    try {
      if (!navigator.storage?.estimate) {
        const estimate: StorageEstimate = {
          quota: 0,
          usage: 0,
          available: 0,
          percentUsed: 0
        };
        this.storageEstimate.set(estimate);
        return estimate;
      }

      const { quota = 0, usage = 0 } = await navigator.storage.estimate();
      const available = quota - usage;
      const percentUsed = quota > 0 ? (usage / quota) * 100 : 0;

      const estimate: StorageEstimate = {
        quota,
        usage,
        available,
        percentUsed
      };

      this.storageEstimate.set(estimate);
      return estimate;
    } catch (error) {
      console.error('Error checking storage quota:', error);
      const estimate: StorageEstimate = {
        quota: 0,
        usage: 0,
        available: 0,
        percentUsed: 0
      };
      this.storageEstimate.set(estimate);
      return estimate;
    }
  }

  async requestPersistentStorage(): Promise<boolean> {
    try {
      if (!navigator.storage?.persist) {
        return false;
      }
      return await navigator.storage.persist();
    } catch (error) {
      console.error('Error requesting persistent storage:', error);
      return false;
    }
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getBrowserInfo(): { name: string; version: string; isSupported: boolean } {
    const ua = navigator.userAgent;
    let name = 'Unknown';
    let version = '0';
    let isSupported = false;

    if (ua.includes('Chrome')) {
      name = 'Chrome';
      const match = ua.match(/Chrome\/(\d+)/);
      version = match ? match[1] : '0';
      isSupported = parseInt(version) >= 113;
    } else if (ua.includes('Edge')) {
      name = 'Edge';
      const match = ua.match(/Edg\/(\d+)/);
      version = match ? match[1] : '0';
      isSupported = parseInt(version) >= 113;
    } else if (ua.includes('Firefox')) {
      name = 'Firefox';
      const match = ua.match(/Firefox\/(\d+)/);
      version = match ? match[1] : '0';
      isSupported = parseInt(version) >= 141;
    } else if (ua.includes('Safari')) {
      name = 'Safari';
      const match = ua.match(/Version\/(\d+)/);
      version = match ? match[1] : '0';
      isSupported = parseInt(version) >= 26;
    }

    return { name, version, isSupported };
  }
}
