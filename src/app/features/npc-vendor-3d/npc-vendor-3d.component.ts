import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  AfterViewInit,
  inject,
  signal,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as THREE from 'three';
import { NpcVendorService } from '../../core/services/npc/npc-vendor.service';
import { InventoryService } from '../../core/services/npc/inventory.service';

/**
 * Application state machine
 */
type AppState = 'loading' | 'playing' | 'dialogue';

/**
 * NPC Vendor 3D Component
 *
 * Features:
 * - Model loads FIRST before showing 3D scene
 * - Dialogue UI (not modal) with space for NPC portrait
 * - Internal prompts are hidden from player
 * - Responds in player's language
 */
@Component({
  selector: 'app-npc-vendor-3d',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- ═══════════════════════════════════════════════════════════════════
         LOADING SCREEN - Shows FIRST while AI models load
         ═══════════════════════════════════════════════════════════════════ -->
    @if (appState() === 'loading') {
      <div class="loading-screen">
        <div class="loading-content">
          <div class="loading-icon">
            <div class="cube-spinner"></div>
          </div>
          <h1>Cargando NPC Vendedor</h1>
          <p class="loading-status">{{ vendor.initStatus() || 'Iniciando...' }}</p>

          <div class="loading-stages">
            <div class="stage" [class.active]="vendor.initStage() === 'embeddings'" [class.done]="isStageComplete('embeddings')">
              <span class="stage-dot"></span>
              <span>Modelo de Embeddings</span>
            </div>
            <div class="stage" [class.active]="vendor.initStage() === 'knowledge'" [class.done]="isStageComplete('knowledge')">
              <span class="stage-dot"></span>
              <span>Base de Conocimiento</span>
            </div>
            <div class="stage" [class.active]="vendor.initStage() === 'llm'" [class.done]="isStageComplete('llm')">
              <span class="stage-dot"></span>
              <span>Modelo de IA (LLM)</span>
            </div>
          </div>

          <div class="progress-container">
            <div class="progress-bar">
              <div class="progress-fill" [style.width.%]="vendor.initProgress()"></div>
            </div>
            <span class="progress-text">{{ vendor.initProgress() }}%</span>
          </div>

          @if (vendor.initStage() === 'llm') {
            <p class="loading-hint">Primera carga descarga ~900MB. Después usa caché local.</p>
          }
        </div>
      </div>
    }

    <!-- ═══════════════════════════════════════════════════════════════════
         GAME SCREEN - 3D Scene + HUD + Dialogue
         ═══════════════════════════════════════════════════════════════════ -->
    @if (appState() !== 'loading') {
      <div class="game-container">
        <!-- 3D Canvas -->
        <div #sceneContainer class="scene-container"></div>

        <!-- HUD Overlay -->
        <div class="hud">
          <!-- Player Stats -->
          <div class="player-stats">
            <div class="stat">
              <span class="stat-label">HP</span>
              <div class="stat-bar">
                <div
                  class="stat-fill hp"
                  [style.width.%]="(inventory.playerHP() / inventory.playerMaxHP()) * 100"
                ></div>
              </div>
              <span class="stat-value">{{ inventory.playerHP() }}/{{ inventory.playerMaxHP() }}</span>
            </div>
            <div class="stat gold-stat">
              <span class="stat-label">ORO</span>
              <span class="stat-value gold">{{ inventory.playerGold() }}</span>
            </div>
          </div>

          <!-- Interaction Prompt (when near NPC and not in dialogue) -->
          @if (canInteract() && appState() === 'playing') {
            <div class="interaction-prompt">
              <span class="key">E</span>
              <span>Hablar con Grimlock</span>
            </div>
          }

          <!-- Controls -->
          <div class="controls-help">
            @if (appState() === 'playing') {
              <span>WASD mover</span>
              @if (canInteract()) {
                <span>E interactuar</span>
              }
            } @else {
              <span>ESC cerrar diálogo</span>
            }
          </div>
        </div>

        <!-- ═══════════════════════════════════════════════════════════════
             DIALOGUE BOX - Game-style dialogue (not modal)
             ═══════════════════════════════════════════════════════════════ -->
        @if (appState() === 'dialogue') {
          <div class="dialogue-container">
            <!-- NPC Portrait Area -->
            <div class="npc-portrait-area">
              <div class="portrait-frame">
                <div class="portrait-placeholder">
                  <span class="portrait-letter">G</span>
                </div>
                <div class="portrait-name">Grimlock</div>
                <div class="portrait-title">Comerciante</div>
              </div>
            </div>

            <!-- Dialogue Panel -->
            <div class="dialogue-panel">
              <!-- Chat Messages -->
              <div class="dialogue-messages" #chatMessages>
                @for (msg of chatHistory(); track msg.timestamp) {
                  <div class="dialogue-message" [class.player]="msg.role === 'user'">
                    @if (msg.role === 'user') {
                      <span class="message-author">Tú:</span>
                    }
                    <span class="message-text">{{ msg.content }}</span>
                  </div>
                }
                @if (vendor.isThinking()) {
                  <div class="dialogue-message typing">
                    <span class="typing-dots"><span></span><span></span><span></span></span>
                  </div>
                }
              </div>

              <!-- Input Area -->
              <div class="dialogue-input-area">
                <input
                  type="text"
                  [(ngModel)]="messageInput"
                  (keyup.enter)="sendMessage()"
                  placeholder="Escribe tu mensaje..."
                  [disabled]="vendor.isThinking()"
                  #chatInput
                />
                <button
                  class="send-btn"
                  (click)="sendMessage()"
                  [disabled]="!messageInput.trim() || vendor.isThinking()"
                >
                  Enviar
                </button>
              </div>

              <!-- Quick Actions -->
              <div class="quick-actions">
                <button (click)="askAbout('¿Qué vendes?')">Ver Items</button>
                <button (click)="askAbout('¿Tienes pociones?')">Pociones</button>
                <button (click)="askAbout('¿Tienes armas?')">Armas</button>
                <button (click)="askAbout('¿Quién eres?')">Sobre ti</button>
              </div>
            </div>

            <!-- Close Button -->
            <button class="close-dialogue-btn" (click)="closeDialogue()">
              ESC
            </button>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100vh;
      overflow: hidden;
      font-family: 'Segoe UI', system-ui, sans-serif;
    }

    /* ════════════════════════════════════════════════════════════════════
       LOADING SCREEN
       ════════════════════════════════════════════════════════════════════ */
    .loading-screen {
      position: fixed;
      inset: 0;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f1a 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .loading-content {
      text-align: center;
      color: #fff;
      max-width: 400px;
      padding: 20px;
    }

    .loading-icon {
      margin-bottom: 24px;
    }

    .cube-spinner {
      width: 60px;
      height: 60px;
      margin: 0 auto;
      background: linear-gradient(135deg, #ff6600, #ff8833);
      border-radius: 8px;
      animation: cube-spin 2s ease-in-out infinite;
    }

    @keyframes cube-spin {
      0%, 100% { transform: rotate(0deg) scale(1); }
      25% { transform: rotate(90deg) scale(1.1); }
      50% { transform: rotate(180deg) scale(1); }
      75% { transform: rotate(270deg) scale(1.1); }
    }

    .loading-content h1 {
      font-size: 24px;
      margin-bottom: 8px;
      color: #fff;
    }

    .loading-status {
      color: #888;
      margin-bottom: 24px;
      min-height: 24px;
    }

    .loading-stages {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 24px;
      text-align: left;
    }

    .stage {
      display: flex;
      align-items: center;
      gap: 12px;
      color: #555;
      transition: color 0.3s;
    }

    .stage.active {
      color: #ff6600;
    }

    .stage.done {
      color: #44ff44;
    }

    .stage-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: currentColor;
      opacity: 0.5;
    }

    .stage.active .stage-dot {
      animation: pulse-dot 1s ease-in-out infinite;
    }

    .stage.done .stage-dot {
      opacity: 1;
    }

    @keyframes pulse-dot {
      0%, 100% { opacity: 0.5; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.2); }
    }

    .progress-container {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .progress-bar {
      flex: 1;
      height: 8px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #ff6600, #ffaa00);
      transition: width 0.3s ease;
    }

    .progress-text {
      font-family: monospace;
      color: #ff6600;
      min-width: 45px;
    }

    .loading-hint {
      margin-top: 16px;
      font-size: 12px;
      color: #666;
    }

    /* ════════════════════════════════════════════════════════════════════
       GAME CONTAINER
       ════════════════════════════════════════════════════════════════════ */
    .game-container {
      position: relative;
      width: 100%;
      height: 100%;
      background: #0a0a0f;
    }

    .scene-container {
      width: 100%;
      height: 100%;
    }

    /* ════════════════════════════════════════════════════════════════════
       HUD
       ════════════════════════════════════════════════════════════════════ */
    .hud {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      padding: 20px;
    }

    .player-stats {
      display: flex;
      gap: 16px;
    }

    .stat {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(0, 0, 0, 0.7);
      padding: 8px 16px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .stat-label {
      font-weight: bold;
      color: #888;
      font-size: 11px;
      text-transform: uppercase;
    }

    .stat-bar {
      width: 80px;
      height: 6px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      overflow: hidden;
    }

    .stat-fill {
      height: 100%;
      transition: width 0.3s ease;
    }

    .stat-fill.hp {
      background: linear-gradient(90deg, #22cc44, #44ff66);
    }

    .stat-value {
      font-family: monospace;
      font-size: 12px;
      color: #fff;
    }

    .stat-value.gold {
      color: #ffd700;
      font-size: 14px;
      font-weight: bold;
    }

    .interaction-prompt {
      position: absolute;
      bottom: 200px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 12px;
      background: rgba(0, 0, 0, 0.85);
      padding: 12px 24px;
      border-radius: 8px;
      border: 2px solid #ff6600;
      animation: float 2s ease-in-out infinite;
    }

    .interaction-prompt .key {
      background: #ff6600;
      color: #000;
      padding: 4px 12px;
      border-radius: 4px;
      font-weight: bold;
      font-family: monospace;
    }

    @keyframes float {
      0%, 100% { transform: translateX(-50%) translateY(0); }
      50% { transform: translateX(-50%) translateY(-5px); }
    }

    .controls-help {
      position: absolute;
      bottom: 20px;
      left: 20px;
      display: flex;
      gap: 16px;
      font-size: 11px;
      color: #555;
    }

    /* ════════════════════════════════════════════════════════════════════
       DIALOGUE CONTAINER - Game-style dialogue box
       ════════════════════════════════════════════════════════════════════ */
    .dialogue-container {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 320px;
      display: flex;
      background: linear-gradient(0deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.8) 100%);
      border-top: 3px solid #ff6600;
    }

    /* NPC Portrait */
    .npc-portrait-area {
      width: 200px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      border-right: 1px solid rgba(255, 102, 0, 0.3);
    }

    .portrait-frame {
      text-align: center;
    }

    .portrait-placeholder {
      width: 120px;
      height: 120px;
      background: linear-gradient(135deg, #ff6600, #ff8833);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 12px;
      box-shadow: 0 4px 20px rgba(255, 102, 0, 0.3);
    }

    .portrait-letter {
      font-size: 64px;
      font-weight: bold;
      color: #000;
    }

    .portrait-name {
      font-size: 18px;
      font-weight: bold;
      color: #fff;
    }

    .portrait-title {
      font-size: 12px;
      color: #ff6600;
      margin-top: 4px;
    }

    /* Dialogue Panel */
    .dialogue-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 16px 20px;
      overflow: hidden;
    }

    .dialogue-messages {
      flex: 1;
      overflow-y: auto;
      padding-right: 10px;
      margin-bottom: 12px;
    }

    .dialogue-message {
      margin-bottom: 12px;
      line-height: 1.5;
    }

    .dialogue-message .message-author {
      color: #4499ff;
      font-weight: bold;
      margin-right: 8px;
    }

    .dialogue-message .message-text {
      color: #ddd;
    }

    .dialogue-message.player {
      text-align: right;
      color: #aaa;
    }

    .dialogue-message.player .message-text {
      color: #88ccff;
    }

    .dialogue-message.typing {
      color: #ff6600;
    }

    .typing-dots {
      display: inline-flex;
      gap: 4px;
    }

    .typing-dots span {
      width: 8px;
      height: 8px;
      background: #ff6600;
      border-radius: 50%;
      animation: typing-bounce 1.4s ease-in-out infinite;
    }

    .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
    .typing-dots span:nth-child(3) { animation-delay: 0.4s; }

    @keyframes typing-bounce {
      0%, 100% { transform: translateY(0); opacity: 0.4; }
      50% { transform: translateY(-6px); opacity: 1; }
    }

    /* Input Area */
    .dialogue-input-area {
      display: flex;
      gap: 10px;
      margin-bottom: 12px;
    }

    .dialogue-input-area input {
      flex: 1;
      padding: 12px 16px;
      border: 1px solid rgba(255, 102, 0, 0.4);
      border-radius: 6px;
      background: rgba(0, 0, 0, 0.5);
      color: #fff;
      font-size: 14px;
    }

    .dialogue-input-area input:focus {
      outline: none;
      border-color: #ff6600;
    }

    .dialogue-input-area input::placeholder {
      color: #666;
    }

    .send-btn {
      padding: 12px 24px;
      border: none;
      border-radius: 6px;
      background: linear-gradient(135deg, #ff6600, #ff8833);
      color: #000;
      font-weight: bold;
      cursor: pointer;
      transition: transform 0.2s, opacity 0.2s;
    }

    .send-btn:hover:not(:disabled) {
      transform: scale(1.05);
    }

    .send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Quick Actions */
    .quick-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .quick-actions button {
      padding: 8px 14px;
      border: 1px solid rgba(255, 102, 0, 0.4);
      border-radius: 4px;
      background: transparent;
      color: #ff9944;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .quick-actions button:hover {
      background: rgba(255, 102, 0, 0.2);
      border-color: #ff6600;
    }

    /* Close Button */
    .close-dialogue-btn {
      position: absolute;
      top: 16px;
      right: 16px;
      padding: 8px 16px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      background: rgba(0, 0, 0, 0.5);
      color: #888;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .close-dialogue-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
    }

    /* Scrollbar */
    .dialogue-messages::-webkit-scrollbar {
      width: 6px;
    }

    .dialogue-messages::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 3px;
    }

    .dialogue-messages::-webkit-scrollbar-thumb {
      background: rgba(255, 102, 0, 0.4);
      border-radius: 3px;
    }
  `],
})
export class NpcVendor3dComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('sceneContainer') sceneContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('chatMessages') chatMessagesEl?: ElementRef<HTMLDivElement>;
  @ViewChild('chatInput') chatInputEl?: ElementRef<HTMLInputElement>;

  readonly vendor = inject(NpcVendorService);
  readonly inventory = inject(InventoryService);

  // Application state
  readonly appState = signal<AppState>('loading');
  readonly canInteract = signal(false);
  messageInput = '';

  // Chat history from vendor service
  chatHistory = this.vendor.chatHistory;

  // Three.js objects
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private player!: THREE.Mesh;
  private npc!: THREE.Mesh;
  private interactionRing!: THREE.Mesh;

  // Input state
  private keys: Set<string> = new Set();
  private animationFrameId: number = 0;

  // Constants
  private readonly INTERACTION_DISTANCE = 3.5;
  private readonly PLAYER_SPEED = 0.12;

  ngOnInit(): void {
    // Start loading AI models FIRST
    this.loadAIModels();
  }

  ngAfterViewInit(): void {
    // Scene will be initialized AFTER models are loaded
  }

  ngOnDestroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.renderer?.dispose();
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    this.keys.add(event.code);

    if (this.appState() === 'playing') {
      // E to start dialogue
      if (event.code === 'KeyE' && this.canInteract()) {
        this.openDialogue();
      }
    } else if (this.appState() === 'dialogue') {
      // Escape to close dialogue
      if (event.code === 'Escape') {
        this.closeDialogue();
      }
    }
  }

  @HostListener('window:keyup', ['$event'])
  onKeyUp(event: KeyboardEvent): void {
    this.keys.delete(event.code);
  }

  @HostListener('window:resize')
  onResize(): void {
    if (!this.camera || !this.renderer || !this.sceneContainer) return;

    const width = this.sceneContainer.nativeElement.clientWidth;
    const height = this.sceneContainer.nativeElement.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * Check if a loading stage is complete.
   */
  isStageComplete(stage: string): boolean {
    const stages = ['idle', 'embeddings', 'knowledge', 'llm', 'ready'];
    const currentIndex = stages.indexOf(this.vendor.initStage());
    const stageIndex = stages.indexOf(stage);
    return currentIndex > stageIndex;
  }

  /**
   * Load AI models before showing the game.
   */
  private async loadAIModels(): Promise<void> {
    try {
      await this.vendor.initialize();

      // Models loaded, now initialize the 3D scene
      this.appState.set('playing');

      // Wait for Angular to render the container
      setTimeout(() => {
        this.initializeScene();
        this.startGameLoop();
      }, 100);
    } catch (error) {
      console.error('Failed to load AI models:', error);
    }
  }

  private initializeScene(): void {
    const container = this.sceneContainer.nativeElement;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
    this.scene.fog = new THREE.Fog(0x1a1a2e, 10, 30);

    // Camera
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
    this.camera.position.set(0, 12, 14);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // Create scene
    this.createRoom();
    this.createPlayer();
    this.createNPC();
    this.createLighting();
    this.createDecorations();
  }

  private createRoom(): void {
    // Floor
    const floorGeometry = new THREE.PlaneGeometry(20, 20);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x3d3d5c,
      roughness: 0.8,
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Grid
    const grid = new THREE.GridHelper(20, 20, 0x4a4a6a, 0x2d2d44);
    grid.position.y = 0.01;
    this.scene.add(grid);

    // Walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2d2d44, roughness: 0.9 });

    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), wallMat);
    backWall.position.set(0, 5, -10);
    this.scene.add(backWall);

    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), wallMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-10, 5, 0);
    this.scene.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), wallMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(10, 5, 0);
    this.scene.add(rightWall);
  }

  private createPlayer(): void {
    const geometry = new THREE.CapsuleGeometry(0.4, 1, 8, 16);
    const material = new THREE.MeshStandardMaterial({
      color: 0x00ff88,
      emissive: 0x004422,
      emissiveIntensity: 0.3,
    });
    this.player = new THREE.Mesh(geometry, material);
    this.player.position.set(0, 0.9, 5);
    this.player.castShadow = true;
    this.scene.add(this.player);
  }

  private createNPC(): void {
    // NPC Cube
    const geometry = new THREE.BoxGeometry(1.8, 1.8, 1.8);
    const material = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      emissive: 0x331100,
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.5,
    });
    this.npc = new THREE.Mesh(geometry, material);
    this.npc.position.set(0, 0.9, -3);
    this.npc.castShadow = true;
    this.npc.userData['baseY'] = 0.9;
    this.scene.add(this.npc);

    // Interaction ring
    const ringGeo = new THREE.RingGeometry(2, 2.2, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    this.interactionRing = new THREE.Mesh(ringGeo, ringMat);
    this.interactionRing.rotation.x = -Math.PI / 2;
    this.interactionRing.position.set(0, 0.05, -3);
    this.scene.add(this.interactionRing);
  }

  private createLighting(): void {
    const ambient = new THREE.AmbientLight(0x404060, 0.4);
    this.scene.add(ambient);

    const mainLight = new THREE.PointLight(0xffaa44, 1.5, 25);
    mainLight.position.set(0, 8, 0);
    mainLight.castShadow = true;
    this.scene.add(mainLight);

    const npcLight = new THREE.SpotLight(0xff6600, 2, 10, Math.PI / 6);
    npcLight.position.set(0, 6, -3);
    npcLight.target = this.npc;
    this.scene.add(npcLight);
  }

  private createDecorations(): void {
    // Counter
    const counter = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.8, 1),
      new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9 })
    );
    counter.position.set(0, 0.4, -1.5);
    counter.castShadow = true;
    this.scene.add(counter);

    // Barrels
    const barrelGeo = new THREE.CylinderGeometry(0.4, 0.5, 1, 12);
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });

    const barrel1 = new THREE.Mesh(barrelGeo, barrelMat);
    barrel1.position.set(-6, 0.5, -6);
    this.scene.add(barrel1);

    const barrel2 = new THREE.Mesh(barrelGeo, barrelMat);
    barrel2.position.set(-5, 0.5, -7);
    this.scene.add(barrel2);
  }

  private startGameLoop(): void {
    const animate = () => {
      this.animationFrameId = requestAnimationFrame(animate);
      this.update();
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  private update(): void {
    // Movement only when playing
    if (this.appState() === 'playing') {
      this.handleMovement();
    }

    // NPC animation
    const time = Date.now() * 0.001;
    if (this.npc) {
      this.npc.position.y = this.npc.userData['baseY'] + Math.sin(time * 2) * 0.15;
      this.npc.rotation.y += 0.005;
    }

    // Interaction ring
    if (this.interactionRing) {
      const scale = 1 + Math.sin(time * 3) * 0.1;
      this.interactionRing.scale.set(scale, scale, scale);

      const near = this.checkProximity();
      this.canInteract.set(near);
      (this.interactionRing.material as THREE.MeshBasicMaterial).opacity = near ? 0.6 : 0.2;
    }
  }

  private handleMovement(): void {
    const dir = new THREE.Vector3();

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dir.z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dir.z += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dir.x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dir.x += 1;

    if (dir.length() > 0) {
      dir.normalize().multiplyScalar(this.PLAYER_SPEED);
      this.player.position.add(dir);

      // Bounds
      this.player.position.x = Math.max(-9, Math.min(9, this.player.position.x));
      this.player.position.z = Math.max(-8, Math.min(9, this.player.position.z));

      // Rotation
      this.player.rotation.y = Math.atan2(dir.x, dir.z);
    }
  }

  private checkProximity(): boolean {
    if (!this.player || !this.npc) return false;
    return this.player.position.distanceTo(this.npc.position) <= this.INTERACTION_DISTANCE;
  }

  async openDialogue(): Promise<void> {
    this.appState.set('dialogue');

    setTimeout(() => {
      this.chatInputEl?.nativeElement?.focus();
    }, 100);

    // Get greeting if first time
    if (this.chatHistory().length === 0) {
      try {
        await this.vendor.getGreeting();
        this.scrollToBottom();
      } catch (error) {
        console.error('Greeting error:', error);
      }
    }
  }

  closeDialogue(): void {
    this.appState.set('playing');
    this.messageInput = '';
  }

  async sendMessage(): Promise<void> {
    const msg = this.messageInput.trim();
    if (!msg || this.vendor.isThinking()) return;

    this.messageInput = '';

    try {
      await this.vendor.chat(msg);
      this.scrollToBottom();
    } catch (error) {
      console.error('Chat error:', error);
    }
  }

  async askAbout(question: string): Promise<void> {
    if (this.vendor.isThinking()) return;

    try {
      await this.vendor.chat(question);
      this.scrollToBottom();
    } catch (error) {
      console.error('Ask error:', error);
    }
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.chatMessagesEl) {
        const el = this.chatMessagesEl.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
    }, 100);
  }
}
