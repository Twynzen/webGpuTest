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
import { NpcVendorService, VendorChatMessage } from '../../core/services/npc/npc-vendor.service';
import { InventoryService } from '../../core/services/npc/inventory.service';

/**
 * NPC Vendor 3D Component
 *
 * A complete 3D scene with:
 * - Room environment (bar/shop)
 * - Player character (capsule) with WASD movement
 * - NPC Vendor (cube) with proximity detection
 * - [E] key interaction to open chat
 * - RAG-enhanced AI conversation
 *
 * This demonstrates how to integrate AI-powered NPCs into a 3D game environment.
 */
@Component({
  selector: 'app-npc-vendor-3d',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="game-container">
      <!-- 3D Canvas -->
      <div #sceneContainer class="scene-container"></div>

      <!-- HUD Overlay -->
      <div class="hud">
        <!-- Player Stats -->
        <div class="player-stats">
          <div class="stat">
            <span class="stat-label">HP</span>
            <div class="stat-bar hp-bar">
              <div
                class="stat-fill"
                [style.width.%]="(inventory.playerHP() / inventory.playerMaxHP()) * 100"
              ></div>
            </div>
            <span class="stat-value">{{ inventory.playerHP() }}/{{ inventory.playerMaxHP() }}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Gold</span>
            <span class="stat-value gold">{{ inventory.playerGold() }}</span>
          </div>
        </div>

        <!-- Interaction Prompt -->
        @if (canInteract() && !isChatOpen()) {
          <div class="interaction-prompt">
            <span class="key">E</span>
            <span>Talk to Grimlock</span>
          </div>
        }

        <!-- Controls Help -->
        <div class="controls-help">
          <span>WASD to move</span>
          @if (canInteract()) {
            <span>E to interact</span>
          }
        </div>
      </div>

      <!-- Loading Screen -->
      @if (!isSceneReady()) {
        <div class="loading-screen">
          <div class="loading-content">
            <h2>Loading NPC Vendor Demo</h2>
            <p>{{ vendor.initStatus() || 'Initializing...' }}</p>
            <div class="progress-bar">
              <div
                class="progress-fill"
                [style.width.%]="vendor.initProgress()"
              ></div>
            </div>
            <p class="progress-text">{{ vendor.initProgress() }}%</p>
          </div>
        </div>
      }

      <!-- Chat Panel -->
      @if (isChatOpen()) {
        <div class="chat-overlay" (click)="closeChat()">
          <div class="chat-panel" (click)="$event.stopPropagation()">
            <div class="chat-header">
              <div class="npc-info">
                <div class="npc-avatar">G</div>
                <div class="npc-details">
                  <span class="npc-name">Grimlock</span>
                  <span class="npc-title">Merchant</span>
                </div>
              </div>
              <button class="close-btn" (click)="closeChat()">×</button>
            </div>

            <div class="chat-messages" #chatMessages>
              @for (msg of chatHistory(); track msg.timestamp) {
                <div class="message" [class.user]="msg.role === 'user'">
                  <div class="message-content">{{ msg.content }}</div>
                </div>
              }
              @if (vendor.isThinking()) {
                <div class="message thinking">
                  <div class="typing-indicator">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              }
            </div>

            <div class="chat-input">
              <input
                type="text"
                [(ngModel)]="messageInput"
                (keyup.enter)="sendMessage()"
                placeholder="Talk to Grimlock..."
                [disabled]="vendor.isThinking()"
                #chatInput
              />
              <button
                (click)="sendMessage()"
                [disabled]="!messageInput.trim() || vendor.isThinking()"
              >
                Send
              </button>
            </div>

            <!-- Quick Actions -->
            <div class="quick-actions">
              <button (click)="askAbout('What items do you sell?')">Show Items</button>
              <button (click)="askAbout('What healing do you have?')">Healing</button>
              <button (click)="askAbout('Any weapons?')">Weapons</button>
              <button (click)="askAbout('Tell me about yourself')">About You</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100vh;
      overflow: hidden;
    }

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
      gap: 20px;
      align-items: center;
    }

    .stat {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(0, 0, 0, 0.6);
      padding: 8px 16px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .stat-label {
      font-weight: bold;
      color: #888;
      font-size: 12px;
      text-transform: uppercase;
    }

    .stat-bar {
      width: 100px;
      height: 8px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
      overflow: hidden;
    }

    .stat-fill {
      height: 100%;
      background: linear-gradient(90deg, #ff4444, #ff6666);
      transition: width 0.3s ease;
    }

    .hp-bar .stat-fill {
      background: linear-gradient(90deg, #44ff44, #66ff66);
    }

    .stat-value {
      font-family: monospace;
      color: #fff;
    }

    .stat-value.gold {
      color: #ffd700;
    }

    .interaction-prompt {
      position: absolute;
      bottom: 150px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 12px;
      background: rgba(0, 0, 0, 0.8);
      padding: 12px 24px;
      border-radius: 12px;
      border: 2px solid #ff6600;
      animation: pulse 2s ease-in-out infinite;
    }

    .interaction-prompt .key {
      background: #ff6600;
      color: #000;
      padding: 4px 12px;
      border-radius: 4px;
      font-weight: bold;
      font-family: monospace;
    }

    .controls-help {
      position: absolute;
      bottom: 20px;
      left: 20px;
      display: flex;
      gap: 16px;
      font-size: 12px;
      color: #666;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: translateX(-50%) scale(1); }
      50% { opacity: 0.8; transform: translateX(-50%) scale(1.02); }
    }

    /* ════════════════════════════════════════════════════════════════════
       Loading Screen
       ════════════════════════════════════════════════════════════════════ */
    .loading-screen {
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }

    .loading-content {
      text-align: center;
      color: #fff;
    }

    .loading-content h2 {
      margin-bottom: 16px;
      font-size: 24px;
    }

    .loading-content p {
      color: #888;
      margin-bottom: 24px;
    }

    .progress-bar {
      width: 300px;
      height: 8px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
      overflow: hidden;
      margin: 0 auto;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #ff6600, #ffaa00);
      transition: width 0.3s ease;
    }

    .progress-text {
      margin-top: 8px;
      font-family: monospace;
      color: #ff6600;
    }

    /* ════════════════════════════════════════════════════════════════════
       Chat Panel
       ════════════════════════════════════════════════════════════════════ */
    .chat-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 50;
    }

    .chat-panel {
      width: 500px;
      max-width: 90%;
      max-height: 80vh;
      background: linear-gradient(180deg, #2d2d44 0%, #1a1a2e 100%);
      border-radius: 16px;
      border: 2px solid #ff6600;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .chat-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      background: rgba(255, 102, 0, 0.2);
      border-bottom: 1px solid rgba(255, 102, 0, 0.3);
    }

    .npc-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .npc-avatar {
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, #ff6600, #ff8833);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      font-weight: bold;
      color: #000;
    }

    .npc-details {
      display: flex;
      flex-direction: column;
    }

    .npc-name {
      font-size: 18px;
      font-weight: bold;
      color: #fff;
    }

    .npc-title {
      font-size: 12px;
      color: #ff6600;
    }

    .close-btn {
      width: 32px;
      height: 32px;
      border: none;
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
      border-radius: 8px;
      font-size: 20px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .close-btn:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 200px;
      max-height: 400px;
    }

    .message {
      display: flex;
    }

    .message-content {
      max-width: 80%;
      padding: 12px 16px;
      border-radius: 12px;
      background: rgba(255, 102, 0, 0.2);
      color: #fff;
      line-height: 1.5;
    }

    .message.user {
      justify-content: flex-end;
    }

    .message.user .message-content {
      background: rgba(0, 150, 255, 0.3);
    }

    .message.thinking .message-content {
      background: rgba(255, 102, 0, 0.1);
    }

    .typing-indicator {
      display: flex;
      gap: 4px;
      padding: 4px 0;
    }

    .typing-indicator span {
      width: 8px;
      height: 8px;
      background: #ff6600;
      border-radius: 50%;
      animation: typing 1.4s ease-in-out infinite;
    }

    .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
    .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

    @keyframes typing {
      0%, 100% { transform: translateY(0); opacity: 0.5; }
      50% { transform: translateY(-4px); opacity: 1; }
    }

    .chat-input {
      display: flex;
      gap: 8px;
      padding: 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .chat-input input {
      flex: 1;
      padding: 12px 16px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.3);
      color: #fff;
      font-size: 14px;
    }

    .chat-input input:focus {
      outline: none;
      border-color: #ff6600;
    }

    .chat-input button {
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      background: linear-gradient(135deg, #ff6600, #ff8833);
      color: #000;
      font-weight: bold;
      cursor: pointer;
      transition: transform 0.2s, opacity 0.2s;
    }

    .chat-input button:hover:not(:disabled) {
      transform: scale(1.05);
    }

    .chat-input button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .quick-actions {
      display: flex;
      gap: 8px;
      padding: 0 16px 16px;
      flex-wrap: wrap;
    }

    .quick-actions button {
      padding: 8px 12px;
      border: 1px solid rgba(255, 102, 0, 0.5);
      border-radius: 6px;
      background: transparent;
      color: #ff6600;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .quick-actions button:hover {
      background: rgba(255, 102, 0, 0.2);
    }
  `],
})
export class NpcVendor3dComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('sceneContainer') sceneContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('chatMessages') chatMessagesEl?: ElementRef<HTMLDivElement>;
  @ViewChild('chatInput') chatInputEl?: ElementRef<HTMLInputElement>;

  readonly vendor = inject(NpcVendorService);
  readonly inventory = inject(InventoryService);

  // UI State
  readonly isSceneReady = signal(false);
  readonly isChatOpen = signal(false);
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
  private interactionIndicator!: THREE.Mesh;

  // Input state
  private keys: Set<string> = new Set();
  private animationFrameId: number = 0;

  // Constants
  private readonly INTERACTION_DISTANCE = 3.5;
  private readonly PLAYER_SPEED = 0.12;

  ngOnInit(): void {
    // Start initializing the AI
    this.initializeAI();
  }

  ngAfterViewInit(): void {
    this.initializeScene();
    this.startGameLoop();
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

    // E key for interaction
    if (event.code === 'KeyE' && this.canInteract() && !this.isChatOpen()) {
      this.openChat();
    }

    // Escape to close chat
    if (event.code === 'Escape' && this.isChatOpen()) {
      this.closeChat();
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

  private async initializeAI(): Promise<void> {
    try {
      await this.vendor.initialize();
    } catch (error) {
      console.error('Failed to initialize AI:', error);
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

    // Create scene elements
    this.createRoom();
    this.createPlayer();
    this.createNPC();
    this.createLighting();
    this.createDecorations();

    this.isSceneReady.set(true);
  }

  private createRoom(): void {
    // Floor
    const floorGeometry = new THREE.PlaneGeometry(20, 20);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x3d3d5c,
      roughness: 0.8,
      metalness: 0.2,
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Grid pattern on floor
    const gridHelper = new THREE.GridHelper(20, 20, 0x4a4a6a, 0x2d2d44);
    gridHelper.position.y = 0.01;
    this.scene.add(gridHelper);

    // Walls
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d2d44,
      roughness: 0.9,
    });

    // Back wall
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), wallMaterial);
    backWall.position.set(0, 5, -10);
    backWall.receiveShadow = true;
    this.scene.add(backWall);

    // Left wall
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), wallMaterial);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-10, 5, 0);
    this.scene.add(leftWall);

    // Right wall
    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), wallMaterial);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(10, 5, 0);
    this.scene.add(rightWall);
  }

  private createPlayer(): void {
    // Player capsule
    const geometry = new THREE.CapsuleGeometry(0.4, 1, 8, 16);
    const material = new THREE.MeshStandardMaterial({
      color: 0x00ff88,
      emissive: 0x004422,
      emissiveIntensity: 0.3,
      roughness: 0.5,
    });
    this.player = new THREE.Mesh(geometry, material);
    this.player.position.set(0, 0.9, 5);
    this.player.castShadow = true;
    this.scene.add(this.player);

    // Player glow
    const glowGeometry = new THREE.SphereGeometry(0.8, 16, 16);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.1,
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    this.player.add(glow);
  }

  private createNPC(): void {
    // NPC Cube (vendor)
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

    // Interaction indicator (ring)
    const ringGeometry = new THREE.RingGeometry(2, 2.2, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    this.interactionIndicator = new THREE.Mesh(ringGeometry, ringMaterial);
    this.interactionIndicator.rotation.x = -Math.PI / 2;
    this.interactionIndicator.position.set(0, 0.05, -3);
    this.scene.add(this.interactionIndicator);

    // NPC name tag
    // (In a real game, you'd use a sprite or HTML overlay)
  }

  private createLighting(): void {
    // Ambient
    const ambient = new THREE.AmbientLight(0x404060, 0.4);
    this.scene.add(ambient);

    // Main light (tavern chandelier)
    const mainLight = new THREE.PointLight(0xffaa44, 1.5, 25);
    mainLight.position.set(0, 8, 0);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 1024;
    mainLight.shadow.mapSize.height = 1024;
    this.scene.add(mainLight);

    // NPC spotlight
    const npcLight = new THREE.SpotLight(0xff6600, 2, 10, Math.PI / 6);
    npcLight.position.set(0, 6, -3);
    npcLight.target = this.npc;
    this.scene.add(npcLight);

    // Player fill light
    const playerLight = new THREE.PointLight(0x00ff88, 0.5, 5);
    playerLight.position.set(0, 3, 5);
    this.scene.add(playerLight);
  }

  private createDecorations(): void {
    // Counter/table in front of NPC
    const counterGeometry = new THREE.BoxGeometry(4, 0.8, 1);
    const counterMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a3728,
      roughness: 0.9,
    });
    const counter = new THREE.Mesh(counterGeometry, counterMaterial);
    counter.position.set(0, 0.4, -1.5);
    counter.castShadow = true;
    counter.receiveShadow = true;
    this.scene.add(counter);

    // Some barrels
    const barrelGeometry = new THREE.CylinderGeometry(0.4, 0.5, 1, 12);
    const barrelMaterial = new THREE.MeshStandardMaterial({
      color: 0x5c4033,
      roughness: 0.9,
    });

    const barrel1 = new THREE.Mesh(barrelGeometry, barrelMaterial);
    barrel1.position.set(-6, 0.5, -6);
    barrel1.castShadow = true;
    this.scene.add(barrel1);

    const barrel2 = new THREE.Mesh(barrelGeometry, barrelMaterial);
    barrel2.position.set(-5, 0.5, -7);
    barrel2.castShadow = true;
    this.scene.add(barrel2);

    // Shelf on back wall
    const shelfGeometry = new THREE.BoxGeometry(6, 0.2, 0.8);
    const shelfMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3728 });
    const shelf = new THREE.Mesh(shelfGeometry, shelfMaterial);
    shelf.position.set(0, 3, -9.5);
    this.scene.add(shelf);

    // Bottles on shelf
    const bottleGeometry = new THREE.CylinderGeometry(0.1, 0.15, 0.5, 8);
    const colors = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff];

    for (let i = 0; i < 5; i++) {
      const bottleMaterial = new THREE.MeshStandardMaterial({
        color: colors[i],
        transparent: true,
        opacity: 0.8,
      });
      const bottle = new THREE.Mesh(bottleGeometry, bottleMaterial);
      bottle.position.set(-2 + i, 3.35, -9.5);
      this.scene.add(bottle);
    }
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
    // Only process movement if chat is closed
    if (!this.isChatOpen()) {
      this.handleMovement();
    }

    // NPC floating animation
    const time = Date.now() * 0.001;
    if (this.npc) {
      this.npc.position.y = this.npc.userData['baseY'] + Math.sin(time * 2) * 0.15;
      this.npc.rotation.y += 0.005;
    }

    // Interaction indicator pulse
    if (this.interactionIndicator) {
      const scale = 1 + Math.sin(time * 3) * 0.1;
      this.interactionIndicator.scale.set(scale, scale, scale);

      const canInteract = this.checkProximity();
      this.canInteract.set(canInteract);

      // Change indicator color based on proximity
      const material = this.interactionIndicator.material as THREE.MeshBasicMaterial;
      material.opacity = canInteract ? 0.8 : 0.3;
    }
  }

  private handleMovement(): void {
    const direction = new THREE.Vector3();

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) direction.z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) direction.z += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) direction.x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) direction.x += 1;

    if (direction.length() > 0) {
      direction.normalize().multiplyScalar(this.PLAYER_SPEED);
      this.player.position.add(direction);

      // Clamp to room bounds
      this.player.position.x = Math.max(-9, Math.min(9, this.player.position.x));
      this.player.position.z = Math.max(-8, Math.min(9, this.player.position.z));

      // Rotate player to face movement direction
      if (direction.x !== 0 || direction.z !== 0) {
        this.player.rotation.y = Math.atan2(direction.x, direction.z);
      }
    }
  }

  private checkProximity(): boolean {
    if (!this.player || !this.npc) return false;

    const distance = this.player.position.distanceTo(this.npc.position);
    return distance <= this.INTERACTION_DISTANCE;
  }

  async openChat(): Promise<void> {
    this.isChatOpen.set(true);

    // Focus input
    setTimeout(() => {
      this.chatInputEl?.nativeElement?.focus();
    }, 100);

    // Get greeting if first message
    if (this.chatHistory().length === 0 && this.vendor.isReady()) {
      try {
        await this.vendor.getGreeting();
        this.scrollToBottom();
      } catch (error) {
        console.error('Failed to get greeting:', error);
      }
    }
  }

  closeChat(): void {
    this.isChatOpen.set(false);
    this.messageInput = '';
  }

  async sendMessage(): Promise<void> {
    const message = this.messageInput.trim();
    if (!message || this.vendor.isThinking()) return;

    this.messageInput = '';

    try {
      await this.vendor.chat(message);
      this.scrollToBottom();
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }

  async askAbout(question: string): Promise<void> {
    if (this.vendor.isThinking()) return;

    try {
      await this.vendor.chat(question);
      this.scrollToBottom();
    } catch (error) {
      console.error('Failed to ask:', error);
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
