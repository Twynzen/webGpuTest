import { Component, inject, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LlmService, NPC_PRESETS, NPC_MODELS } from '../../core/services/ai/llm.service';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

@Component({
  selector: 'app-npc-brain',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="npc-brain">
      <header class="page-header">
        <div class="header-content">
          <h1>NPC Brain</h1>
          <p class="subtitle">Chat with AI-powered NPCs using WebLLM</p>
        </div>
        <div class="header-badge">
          <span class="badge badge-info">WebLLM</span>
          <span class="badge" [class.badge-success]="llm.isReady()" [class.badge-warning]="!llm.isReady()">
            {{ llm.isReady() ? 'Ready' : 'Not loaded' }}
          </span>
        </div>
      </header>

      <div class="content-grid">
        <!-- NPC Selection Panel -->
        <aside class="config-panel card">
          <h2 class="panel-title">Select NPC</h2>

          <div class="npc-list">
            @for (npc of npcList; track npc.key) {
              <button
                class="npc-card"
                [class.selected]="selectedNpc() === npc.key"
                [disabled]="llm.isLoading()"
                (click)="selectNpc(npc.key)"
              >
                <span class="npc-avatar">{{ npc.avatar }}</span>
                <div class="npc-info">
                  <span class="npc-name">{{ npc.name }}</span>
                  <span class="npc-role">{{ npc.role }}</span>
                </div>
              </button>
            }
          </div>

          <div class="model-info">
            <h3>Model</h3>
            <select
              class="input"
              [ngModel]="selectedModel()"
              (ngModelChange)="onModelChange($event)"
              [disabled]="llm.isLoading()"
            >
              @for (model of modelList; track model.id) {
                <option [value]="model.id">{{ model.name }} ({{ model.vram }})</option>
              }
            </select>
          </div>

          @if (!llm.isReady() && !llm.isLoading()) {
            <button class="btn btn-primary w-full" (click)="loadModel()">
              Load Model
            </button>
          }

          @if (llm.isLoading()) {
            <div class="loading-state">
              <div class="progress-bar">
                <div class="progress-fill" [style.width.%]="llm.loadProgress()"></div>
              </div>
              <p class="loading-text">{{ llm.loadStatus() }} ({{ llm.loadProgress() }}%)</p>
            </div>
          }

          @if (llm.isReady()) {
            <button class="btn btn-secondary w-full" (click)="resetChat()">
              Reset Conversation
            </button>
          }
        </aside>

        <!-- Chat Panel -->
        <section class="chat-panel card">
          @if (!llm.isReady()) {
            <div class="empty-state">
              <span class="empty-icon">🤖</span>
              <h3>Select an NPC and load the model</h3>
              <p>Choose a character from the left panel and click "Load Model" to start chatting.</p>
            </div>
          } @else {
            <div class="chat-container">
              <!-- Chat Messages -->
              <div class="messages-container" #messagesContainer>
                @if (messages().length === 0) {
                  <div class="welcome-message">
                    <span class="welcome-avatar">{{ currentNpcAvatar() }}</span>
                    <p>{{ currentNpcGreeting() }}</p>
                  </div>
                }

                @for (message of messages(); track $index) {
                  <div class="message" [class.user]="message.role === 'user'" [class.assistant]="message.role === 'assistant'">
                    @if (message.role === 'assistant') {
                      <span class="message-avatar">{{ currentNpcAvatar() }}</span>
                    }
                    <div class="message-content">
                      <p>{{ message.content }}</p>
                      <span class="message-time">{{ message.timestamp | date:'HH:mm' }}</span>
                    </div>
                    @if (message.role === 'user') {
                      <span class="message-avatar">👤</span>
                    }
                  </div>
                }

                @if (llm.isGenerating()) {
                  <div class="message assistant">
                    <span class="message-avatar">{{ currentNpcAvatar() }}</span>
                    <div class="message-content typing">
                      <span class="typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                      </span>
                    </div>
                  </div>
                }

                @if (streamingResponse()) {
                  <div class="message assistant">
                    <span class="message-avatar">{{ currentNpcAvatar() }}</span>
                    <div class="message-content">
                      <p>{{ streamingResponse() }}</p>
                    </div>
                  </div>
                }
              </div>

              <!-- Input Area -->
              <div class="input-area">
                <input
                  type="text"
                  class="input message-input"
                  placeholder="Type your message..."
                  [(ngModel)]="userInput"
                  (keyup.enter)="sendMessage()"
                  [disabled]="llm.isGenerating()"
                />
                <button
                  class="btn btn-primary send-btn"
                  (click)="sendMessage()"
                  [disabled]="!userInput.trim() || llm.isGenerating()"
                >
                  @if (llm.isGenerating()) {
                    <span class="spinner"></span>
                  } @else {
                    Send
                  }
                </button>
              </div>
            </div>
          }
        </section>
      </div>
    </div>
  `,
  styles: [`
    .npc-brain {
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
      margin-bottom: 0.5rem;
    }

    .npc-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .npc-card {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
      background: var(--bg-tertiary);
      border: 1px solid transparent;
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: all 0.2s;
      text-align: left;

      &:hover:not(:disabled) {
        border-color: var(--primary-color);
      }

      &.selected {
        border-color: var(--primary-color);
        background: rgba(99, 102, 241, 0.1);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    .npc-avatar {
      font-size: 2rem;
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-secondary);
      border-radius: var(--radius-md);
    }

    .npc-info {
      display: flex;
      flex-direction: column;
    }

    .npc-name {
      font-weight: 500;
      color: var(--text-primary);
    }

    .npc-role {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .model-info {
      margin-top: 1rem;

      h3 {
        font-size: 0.875rem;
        font-weight: 500;
        margin-bottom: 0.5rem;
        color: var(--text-secondary);
      }
    }

    .loading-state {
      margin-top: 1rem;
    }

    .loading-text {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 0.5rem;
      text-align: center;
    }

    .chat-panel {
      display: flex;
      flex-direction: column;
      min-height: 500px;
      max-height: calc(100vh - 200px);
    }

    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 2rem;

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

    .chat-container {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .messages-container {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .welcome-message {
      text-align: center;
      padding: 2rem;
      color: var(--text-secondary);

      .welcome-avatar {
        font-size: 3rem;
        display: block;
        margin-bottom: 1rem;
      }
    }

    .message {
      display: flex;
      gap: 0.75rem;
      max-width: 80%;

      &.user {
        margin-left: auto;
        flex-direction: row-reverse;
      }

      &.assistant {
        margin-right: auto;
      }
    }

    .message-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-tertiary);
      font-size: 1.25rem;
      flex-shrink: 0;
    }

    .message-content {
      padding: 0.75rem 1rem;
      border-radius: var(--radius-lg);
      position: relative;

      .user & {
        background: var(--primary-color);
        color: white;
        border-bottom-right-radius: var(--radius-sm);
      }

      .assistant & {
        background: var(--bg-tertiary);
        border-bottom-left-radius: var(--radius-sm);
      }

      p {
        margin: 0;
        line-height: 1.5;
      }
    }

    .message-time {
      font-size: 0.65rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
      display: block;

      .user & {
        color: rgba(255, 255, 255, 0.7);
      }
    }

    .typing-indicator {
      display: flex;
      gap: 4px;

      span {
        width: 8px;
        height: 8px;
        background: var(--text-muted);
        border-radius: 50%;
        animation: bounce 1.4s infinite ease-in-out both;

        &:nth-child(1) { animation-delay: -0.32s; }
        &:nth-child(2) { animation-delay: -0.16s; }
      }
    }

    @keyframes bounce {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1); }
    }

    .input-area {
      display: flex;
      gap: 0.75rem;
      padding: 1rem;
      border-top: 1px solid var(--border-color);
    }

    .message-input {
      flex: 1;
    }

    .send-btn {
      min-width: 80px;
    }

    @media (max-width: 768px) {
      .content-grid {
        grid-template-columns: 1fr;
      }

      .config-panel {
        order: 2;
      }

      .chat-panel {
        order: 1;
        min-height: 400px;
      }
    }
  `],
})
export class NpcBrainComponent implements OnDestroy {
  readonly llm = inject(LlmService);

  userInput = '';
  readonly messages = signal<ChatMessage[]>([]);
  readonly streamingResponse = signal('');
  readonly selectedNpc = signal<string>('blacksmith');
  readonly selectedModel = signal(NPC_PRESETS['blacksmith'].modelId);

  readonly npcList = [
    { key: 'blacksmith', name: 'Gareth', role: 'Blacksmith', avatar: '🔨' },
    { key: 'merchant', name: 'Mirella', role: 'Merchant', avatar: '💰' },
    { key: 'innkeeper', name: 'Old Thomas', role: 'Innkeeper', avatar: '🍺' },
    { key: 'wizard', name: 'Elyndra', role: 'Wizard', avatar: '🧙' },
  ];

  readonly modelList = [
    { id: NPC_MODELS.tiny.id, name: 'SmolLM2 360M', vram: NPC_MODELS.tiny.vram },
    { id: NPC_MODELS.balanced.id, name: 'Llama 3.2 1B', vram: NPC_MODELS.balanced.vram },
    { id: NPC_MODELS.quality.id, name: 'Llama 3.2 3B', vram: NPC_MODELS.quality.vram },
    { id: NPC_MODELS.advanced.id, name: 'Phi-3.5 Mini', vram: NPC_MODELS.advanced.vram },
  ];

  readonly currentNpcAvatar = computed(() => {
    const npc = this.npcList.find(n => n.key === this.selectedNpc());
    return npc?.avatar || '🤖';
  });

  readonly currentNpcGreeting = computed(() => {
    const greetings: Record<string, string> = {
      blacksmith: "Greetings, traveler! What brings you to my forge today?",
      merchant: "Welcome, welcome! I have the finest goods from across the realm!",
      innkeeper: "Come in, come in! Rest your weary feet and let me pour you something.",
      wizard: "The stars have foretold your arrival... What knowledge do you seek?",
    };
    return greetings[this.selectedNpc()] || "Hello, how can I help you?";
  });

  selectNpc(key: string): void {
    if (this.selectedNpc() === key) return;
    this.selectedNpc.set(key);
    const preset = NPC_PRESETS[key];
    if (preset) {
      this.selectedModel.set(preset.modelId);
      if (this.llm.isReady()) {
        this.llm.resetConversation(preset.systemPrompt);
        this.messages.set([]);
      }
    }
  }

  onModelChange(modelId: string): void {
    this.selectedModel.set(modelId);
  }

  async loadModel(): Promise<void> {
    const preset = NPC_PRESETS[this.selectedNpc()];
    const config = {
      ...preset,
      modelId: this.selectedModel(),
    };
    await this.llm.initialize(config);
  }

  async sendMessage(): Promise<void> {
    const message = this.userInput.trim();
    if (!message || this.llm.isGenerating()) return;

    this.userInput = '';

    // Add user message
    this.messages.update(msgs => [...msgs, {
      role: 'user' as const,
      content: message,
      timestamp: new Date(),
    }]);

    // Stream response
    this.streamingResponse.set('');

    try {
      const response = await this.llm.chatStreaming(message, (chunk) => {
        this.streamingResponse.update(prev => prev + chunk);
      });

      // Move streaming response to messages
      this.streamingResponse.set('');
      this.messages.update(msgs => [...msgs, {
        role: 'assistant' as const,
        content: response,
        timestamp: new Date(),
      }]);
    } catch (error) {
      console.error('Chat error:', error);
      this.streamingResponse.set('');
    }
  }

  resetChat(): void {
    const preset = NPC_PRESETS[this.selectedNpc()];
    if (preset) {
      this.llm.resetConversation(preset.systemPrompt);
    }
    this.messages.set([]);
    this.streamingResponse.set('');
  }

  async ngOnDestroy(): Promise<void> {
    await this.llm.dispose();
  }
}
