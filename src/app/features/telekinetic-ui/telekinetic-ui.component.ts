import {
  Component,
  inject,
  OnDestroy,
  signal,
  ElementRef,
  ViewChild,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MediaPipeService, HandGesture } from '../../core/services/ai/mediapipe.service';

interface InteractiveElement {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  isHovered: boolean;
  isSelected: boolean;
}

@Component({
  selector: 'app-telekinetic-ui',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="telekinetic-ui">
      <header class="page-header">
        <div class="header-content">
          <h1>Telekinetic UI</h1>
          <p class="subtitle">Control UI elements with hand gestures at 60 FPS</p>
        </div>
        <div class="header-badge">
          <span class="badge badge-info">MediaPipe</span>
          <span class="badge" [class.badge-success]="mediaPipe.isReady()" [class.badge-warning]="!mediaPipe.isReady()">
            {{ mediaPipe.isReady() ? 'Ready' : 'Not loaded' }}
          </span>
          @if (mediaPipe.isTracking()) {
            <span class="badge badge-success">{{ mediaPipe.fps() }} FPS</span>
          }
        </div>
      </header>

      <div class="content-area">
        <!-- Controls -->
        <div class="controls-bar card">
          @if (!mediaPipe.isReady() && !mediaPipe.isLoading()) {
            <button class="btn btn-primary" (click)="loadModel()">
              Load Hand Tracking Model
            </button>
          }

          @if (mediaPipe.isLoading()) {
            <div class="loading-state flex items-center gap-2">
              <span class="spinner"></span>
              <span>Loading model...</span>
            </div>
          }

          @if (mediaPipe.isReady() && !mediaPipe.isTracking()) {
            <button class="btn btn-success" (click)="startTracking()">
              Start Camera
            </button>
          }

          @if (mediaPipe.isTracking()) {
            <button class="btn btn-danger" (click)="stopTracking()">
              Stop Camera
            </button>
          }

          <div class="gesture-info">
            <span class="gesture-label">Gesture:</span>
            <span class="gesture-value" [class]="mediaPipe.gesture().type">
              {{ gestureLabel() }}
            </span>
          </div>

          <div class="instructions">
            <span>Point to hover, Pinch to select</span>
          </div>
        </div>

        <!-- Interactive Canvas -->
        <div class="canvas-container card" #canvasContainer>
          <!-- Video preview (small) -->
          <video #videoEl class="video-preview" playsinline></video>

          <!-- Interactive elements -->
          <div class="interactive-area">
            @for (element of elements(); track element.id) {
              <div
                class="interactive-element"
                [style.left.px]="element.x"
                [style.top.px]="element.y"
                [style.width.px]="element.width"
                [style.height.px]="element.height"
                [style.background]="element.color"
                [class.hovered]="element.isHovered"
                [class.selected]="element.isSelected"
              >
                <span class="element-label">{{ element.label }}</span>
              </div>
            }

            <!-- Hand cursor -->
            @if (mediaPipe.handPosition()) {
              <div
                class="hand-cursor"
                [class.pinching]="mediaPipe.gesture().type === 'pinch'"
                [class.pointing]="mediaPipe.gesture().type === 'point'"
                [style.left.px]="cursorX()"
                [style.top.px]="cursorY()"
              >
                <div class="cursor-ring"></div>
                <div class="cursor-dot"></div>
              </div>
            }
          </div>

          @if (!mediaPipe.isTracking()) {
            <div class="empty-state">
              <span class="empty-icon">✋</span>
              <h3>Hand tracking not active</h3>
              <p>Load the model and start the camera to control elements with your hand.</p>
            </div>
          }
        </div>

        <!-- Selected element info -->
        @if (selectedElement()) {
          <div class="selection-info card">
            <h3>Selected Element</h3>
            <div class="info-row">
              <span class="info-label">Name:</span>
              <span class="info-value">{{ selectedElement()!.label }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Color:</span>
              <span class="info-value">
                <span class="color-swatch" [style.background]="selectedElement()!.color"></span>
                {{ selectedElement()!.color }}
              </span>
            </div>
            <button class="btn btn-secondary w-full" (click)="deselectAll()">
              Deselect
            </button>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .telekinetic-ui {
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

    .content-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      min-height: 0;
    }

    .controls-bar {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      flex-wrap: wrap;
    }

    .gesture-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: var(--bg-tertiary);
      border-radius: var(--radius-md);
    }

    .gesture-label {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .gesture-value {
      font-weight: 600;
      text-transform: capitalize;

      &.pinch { color: var(--secondary-color); }
      &.point { color: var(--primary-color); }
      &.fist { color: var(--accent-color); }
      &.open { color: var(--danger-color); }
    }

    .instructions {
      margin-left: auto;
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .canvas-container {
      flex: 1;
      position: relative;
      min-height: 400px;
      overflow: hidden;
    }

    .video-preview {
      position: absolute;
      bottom: 1rem;
      right: 1rem;
      width: 200px;
      border-radius: var(--radius-md);
      opacity: 0.8;
      transform: scaleX(-1); // Mirror for selfie view
      z-index: 10;
    }

    .interactive-area {
      position: absolute;
      inset: 0;
    }

    .interactive-element {
      position: absolute;
      border-radius: var(--radius-lg);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.1s, box-shadow 0.1s;
      cursor: pointer;
      user-select: none;

      &.hovered {
        transform: scale(1.05);
        box-shadow: 0 0 20px rgba(99, 102, 241, 0.5);
      }

      &.selected {
        box-shadow: 0 0 0 4px var(--primary-color), 0 0 30px rgba(99, 102, 241, 0.5);
      }
    }

    .element-label {
      color: white;
      font-weight: 600;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    }

    .hand-cursor {
      position: absolute;
      width: 40px;
      height: 40px;
      pointer-events: none;
      transform: translate(-50%, -50%);
      z-index: 100;
    }

    .cursor-ring {
      position: absolute;
      inset: 0;
      border: 3px solid var(--primary-color);
      border-radius: 50%;
      opacity: 0.6;
      animation: pulse 1.5s infinite;

      .pinching & {
        border-color: var(--secondary-color);
        animation: none;
        transform: scale(0.8);
      }
    }

    .cursor-dot {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 12px;
      height: 12px;
      background: var(--primary-color);
      border-radius: 50%;
      transform: translate(-50%, -50%);

      .pinching & {
        background: var(--secondary-color);
        width: 16px;
        height: 16px;
      }
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 0.6; }
      50% { transform: scale(1.2); opacity: 0.3; }
    }

    .empty-state {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      background: rgba(0, 0, 0, 0.5);

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

    .selection-info {
      position: absolute;
      bottom: 1rem;
      left: 1rem;
      width: 200px;
      padding: 1rem;
      z-index: 10;

      h3 {
        font-size: 0.875rem;
        font-weight: 600;
        margin-bottom: 0.75rem;
      }
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
      font-size: 0.8rem;
    }

    .info-label {
      color: var(--text-muted);
    }

    .info-value {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .color-swatch {
      width: 16px;
      height: 16px;
      border-radius: 4px;
    }

    @media (max-width: 768px) {
      .video-preview {
        width: 120px;
      }
    }
  `],
})
export class TelekineticUiComponent implements OnDestroy {
  @ViewChild('videoEl') videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasContainer') canvasRef!: ElementRef<HTMLDivElement>;

  readonly mediaPipe = inject(MediaPipeService);

  readonly elements = signal<InteractiveElement[]>([]);
  readonly selectedElement = computed(() =>
    this.elements().find((el) => el.isSelected) || null
  );

  // Cursor position relative to canvas
  readonly cursorX = computed(() => {
    const pos = this.mediaPipe.handPosition();
    return pos ? pos.x - this.canvasOffset.x : 0;
  });

  readonly cursorY = computed(() => {
    const pos = this.mediaPipe.handPosition();
    return pos ? pos.y - this.canvasOffset.y : 0;
  });

  private canvasOffset = { x: 0, y: 0 };
  private wasJustPinching = false;

  gestureLabel(): string {
    const gesture = this.mediaPipe.gesture();
    const labels: Record<string, string> = {
      none: 'No hand',
      point: 'Pointing',
      pinch: 'Pinching',
      fist: 'Fist',
      open: 'Open hand',
    };
    return labels[gesture.type] || gesture.type;
  }

  async loadModel(): Promise<void> {
    await this.mediaPipe.initialize();
    this.initializeElements();
  }

  async startTracking(): Promise<void> {
    // Calculate canvas offset
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    this.canvasOffset = { x: rect.left, y: rect.top };

    await this.mediaPipe.startTracking(
      this.videoRef.nativeElement,
      (result) => this.handleTrackingUpdate(result)
    );
  }

  stopTracking(): void {
    this.mediaPipe.stopTracking();
  }

  private handleTrackingUpdate(result: {
    position: { x: number; y: number; z: number } | null;
    gesture: HandGesture;
  }): void {
    if (!result.position) {
      this.clearHovers();
      return;
    }

    // Get cursor position relative to canvas
    const cursorX = result.position.x - this.canvasOffset.x;
    const cursorY = result.position.y - this.canvasOffset.y;

    // Check hover state for each element
    this.elements.update((els) =>
      els.map((el) => ({
        ...el,
        isHovered: this.isPointInElement(cursorX, cursorY, el),
      }))
    );

    // Handle pinch gesture for selection
    const isPinching = result.gesture.type === 'pinch';

    if (isPinching && !this.wasJustPinching) {
      // Pinch started - toggle selection on hovered element
      const hoveredEl = this.elements().find((el) => el.isHovered);
      if (hoveredEl) {
        this.elements.update((els) =>
          els.map((el) => ({
            ...el,
            isSelected: el.id === hoveredEl.id ? !el.isSelected : false,
          }))
        );
      }
    }

    this.wasJustPinching = isPinching;
  }

  private isPointInElement(
    x: number,
    y: number,
    el: InteractiveElement
  ): boolean {
    return (
      x >= el.x &&
      x <= el.x + el.width &&
      y >= el.y &&
      y <= el.y + el.height
    );
  }

  private clearHovers(): void {
    this.elements.update((els) =>
      els.map((el) => ({ ...el, isHovered: false }))
    );
  }

  deselectAll(): void {
    this.elements.update((els) =>
      els.map((el) => ({ ...el, isSelected: false }))
    );
  }

  private initializeElements(): void {
    const colors = [
      '#6366f1', '#10b981', '#f59e0b', '#ef4444',
      '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16',
    ];

    const elements: InteractiveElement[] = [];
    const gridCols = 4;
    const gridRows = 2;
    const padding = 30;
    const gap = 20;

    // Calculate element size based on container
    const containerWidth = 800;
    const containerHeight = 400;
    const elWidth = (containerWidth - padding * 2 - gap * (gridCols - 1)) / gridCols;
    const elHeight = (containerHeight - padding * 2 - gap * (gridRows - 1)) / gridRows;

    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        const index = row * gridCols + col;
        elements.push({
          id: `el-${index}`,
          label: `Item ${index + 1}`,
          x: padding + col * (elWidth + gap),
          y: padding + row * (elHeight + gap),
          width: elWidth,
          height: elHeight,
          color: colors[index % colors.length],
          isHovered: false,
          isSelected: false,
        });
      }
    }

    this.elements.set(elements);
  }

  ngOnDestroy(): void {
    this.mediaPipe.dispose();
  }
}
