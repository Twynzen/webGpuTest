import { Injectable, signal, NgZone } from '@angular/core';
import {
  FilesetResolver,
  HandLandmarker,
  HandLandmarkerResult,
  NormalizedLandmark,
} from '@mediapipe/tasks-vision';

export interface HandPosition {
  x: number;
  y: number;
  z: number;
}

export interface HandGesture {
  type: 'none' | 'point' | 'pinch' | 'fist' | 'open';
  confidence: number;
}

export interface HandTrackingResult {
  position: HandPosition | null;
  gesture: HandGesture;
  landmarks: NormalizedLandmark[] | null;
  handedness: 'Left' | 'Right' | null;
}

/**
 * Hand landmark indices for gesture detection.
 */
const LANDMARKS = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

/**
 * Service for hand tracking using MediaPipe Tasks.
 * Enables gesture-based UI control at 60 FPS.
 */
@Injectable({ providedIn: 'root' })
export class MediaPipeService {
  private handLandmarker: HandLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private lastVideoTime = -1;
  private animationFrameId: number | null = null;
  private screenWidth = window.innerWidth;
  private screenHeight = window.innerHeight;

  // Signals for reactive state
  readonly isLoading = signal(false);
  readonly isReady = signal(false);
  readonly isTracking = signal(false);
  readonly handPosition = signal<HandPosition | null>(null);
  readonly gesture = signal<HandGesture>({ type: 'none', confidence: 0 });
  readonly landmarks = signal<NormalizedLandmark[] | null>(null);
  readonly fps = signal(0);

  // Callback for real-time tracking updates
  private onTrackingUpdate: ((result: HandTrackingResult) => void) | null = null;

  constructor(private ngZone: NgZone) {
    // Update screen dimensions on resize
    window.addEventListener('resize', () => {
      this.screenWidth = window.innerWidth;
      this.screenHeight = window.innerHeight;
    });
  }

  /**
   * Initialize the hand landmarker model.
   */
  async initialize(): Promise<void> {
    if (this.handLandmarker) {
      return; // Already initialized
    }

    this.isLoading.set(true);

    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      this.isLoading.set(false);
      this.isReady.set(true);
    } catch (error) {
      this.isLoading.set(false);
      console.error('Failed to initialize MediaPipe:', error);
      throw error;
    }
  }

  /**
   * Start hand tracking from a video element.
   */
  async startTracking(
    videoElement: HTMLVideoElement,
    onUpdate?: (result: HandTrackingResult) => void
  ): Promise<void> {
    if (!this.handLandmarker) {
      throw new Error('Hand landmarker not initialized. Call initialize() first.');
    }

    this.video = videoElement;
    this.onTrackingUpdate = onUpdate || null;

    // Request webcam access
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 60 },
        facingMode: 'user',
      },
    });

    this.video.srcObject = stream;
    await this.video.play();

    this.isTracking.set(true);

    // Start detection loop outside Angular zone
    this.ngZone.runOutsideAngular(() => {
      this.detectLoop();
    });
  }

  /**
   * Main detection loop running at ~60 FPS.
   */
  private detectLoop = (): void => {
    if (!this.video || !this.handLandmarker || !this.isTracking()) return;

    const startTime = performance.now();

    if (this.video.currentTime !== this.lastVideoTime && this.video.readyState >= 2) {
      const result = this.handLandmarker.detectForVideo(
        this.video,
        performance.now()
      );
      this.processResult(result);
      this.lastVideoTime = this.video.currentTime;

      // Calculate FPS
      const processingTime = performance.now() - startTime;
      const currentFps = Math.round(1000 / Math.max(processingTime, 1));
      this.ngZone.run(() => this.fps.set(currentFps));
    }

    this.animationFrameId = requestAnimationFrame(this.detectLoop);
  };

  /**
   * Process hand detection result.
   */
  private processResult(result: HandLandmarkerResult): void {
    if (result.landmarks.length > 0) {
      const landmarks = result.landmarks[0];
      const handedness = result.handednesses[0]?.[0]?.categoryName as 'Left' | 'Right';

      // Use index finger tip (landmark 8) as cursor position
      const indexTip = landmarks[LANDMARKS.INDEX_TIP];

      // Mirror X coordinate for selfie view
      const position: HandPosition = {
        x: (1 - indexTip.x) * this.screenWidth,
        y: indexTip.y * this.screenHeight,
        z: indexTip.z,
      };

      const gesture = this.detectGesture(landmarks);

      // Update signals
      this.ngZone.run(() => {
        this.handPosition.set(position);
        this.gesture.set(gesture);
        this.landmarks.set(landmarks);
      });

      // Call tracking callback
      if (this.onTrackingUpdate) {
        this.onTrackingUpdate({
          position,
          gesture,
          landmarks,
          handedness,
        });
      }
    } else {
      this.ngZone.run(() => {
        this.handPosition.set(null);
        this.gesture.set({ type: 'none', confidence: 0 });
        this.landmarks.set(null);
      });

      if (this.onTrackingUpdate) {
        this.onTrackingUpdate({
          position: null,
          gesture: { type: 'none', confidence: 0 },
          landmarks: null,
          handedness: null,
        });
      }
    }
  }

  /**
   * Detect gesture from hand landmarks.
   */
  private detectGesture(landmarks: NormalizedLandmark[]): HandGesture {
    // Pinch: thumb tip close to index tip
    const thumbTip = landmarks[LANDMARKS.THUMB_TIP];
    const indexTip = landmarks[LANDMARKS.INDEX_TIP];
    const pinchDistance = this.distance(thumbTip, indexTip);

    if (pinchDistance < 0.05) {
      return { type: 'pinch', confidence: 1 - pinchDistance * 20 };
    }

    // Check if fingers are extended
    const indexExtended = this.isFingerExtended(landmarks, 'INDEX');
    const middleExtended = this.isFingerExtended(landmarks, 'MIDDLE');
    const ringExtended = this.isFingerExtended(landmarks, 'RING');
    const pinkyExtended = this.isFingerExtended(landmarks, 'PINKY');

    const extendedCount = [indexExtended, middleExtended, ringExtended, pinkyExtended]
      .filter(Boolean).length;

    // Fist: no fingers extended
    if (extendedCount === 0) {
      return { type: 'fist', confidence: 0.9 };
    }

    // Point: only index extended
    if (indexExtended && extendedCount === 1) {
      return { type: 'point', confidence: 0.9 };
    }

    // Open hand: all fingers extended
    if (extendedCount >= 3) {
      return { type: 'open', confidence: extendedCount / 4 };
    }

    return { type: 'point', confidence: 0.5 };
  }

  /**
   * Check if a finger is extended.
   */
  private isFingerExtended(
    landmarks: NormalizedLandmark[],
    finger: 'INDEX' | 'MIDDLE' | 'RING' | 'PINKY'
  ): boolean {
    const tipIdx = LANDMARKS[`${finger}_TIP`];
    const pipIdx = LANDMARKS[`${finger}_PIP`];
    const mcpIdx = LANDMARKS[`${finger}_MCP`];

    const tip = landmarks[tipIdx];
    const pip = landmarks[pipIdx];
    const mcp = landmarks[mcpIdx];

    // Finger is extended if tip is further from wrist than PIP
    const wrist = landmarks[LANDMARKS.WRIST];
    const tipToWrist = this.distance(tip, wrist);
    const pipToWrist = this.distance(pip, wrist);

    return tipToWrist > pipToWrist;
  }

  /**
   * Calculate distance between two landmarks.
   */
  private distance(a: NormalizedLandmark, b: NormalizedLandmark): number {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  }

  /**
   * Stop hand tracking.
   */
  stopTracking(): void {
    this.isTracking.set(false);

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.video?.srcObject) {
      const stream = this.video.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      this.video.srcObject = null;
    }

    this.handPosition.set(null);
    this.gesture.set({ type: 'none', confidence: 0 });
    this.landmarks.set(null);
    this.onTrackingUpdate = null;
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.stopTracking();
    this.handLandmarker?.close();
    this.handLandmarker = null;
    this.isReady.set(false);
  }
}
