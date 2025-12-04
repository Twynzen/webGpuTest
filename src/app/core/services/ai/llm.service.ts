import { Injectable, signal, NgZone } from '@angular/core';
import {
  CreateMLCEngine,
  MLCEngine,
  ChatCompletionMessageParam,
  InitProgressReport,
} from '@mlc-ai/web-llm';

export interface NpcConfig {
  modelId: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

/**
 * Available NPC model configurations with VRAM requirements.
 */
export const NPC_MODELS = {
  tiny: {
    id: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
    vram: '376 MB',
    description: 'Basic NPCs, mobile devices',
  },
  balanced: {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    vram: '879 MB',
    description: 'Best balance quality/resources',
  },
  quality: {
    id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    vram: '2,264 MB',
    description: 'Complex NPCs',
  },
  advanced: {
    id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
    vram: '3,672 MB',
    description: 'Advanced reasoning',
  },
} as const;

/**
 * Pre-configured NPC personalities.
 */
export const NPC_PRESETS: Record<string, NpcConfig> = {
  blacksmith: {
    modelId: NPC_MODELS.balanced.id,
    systemPrompt: `You are Gareth, a wise blacksmith in a medieval fantasy village.
You speak with a gruff but kind tone. You know weapons, armor, and local legends.
Respond in 2-3 sentences. Never break character or mention being an AI.
If asked about weapons or armor, describe them with craftsmanship pride.`,
    temperature: 0.7,
    maxTokens: 256,
  },
  merchant: {
    modelId: NPC_MODELS.balanced.id,
    systemPrompt: `You are Mirella, a cunning and well-traveled merchant.
Always try to sell products and speak enthusiastically about your wares.
Respond in 1-3 sentences. Maintain character at all times.
Hint at exotic locations and rare items from your travels.`,
    temperature: 0.8,
    maxTokens: 256,
  },
  innkeeper: {
    modelId: NPC_MODELS.balanced.id,
    systemPrompt: `You are Old Thomas, the friendly innkeeper of "The Rusty Tankard".
You love gossip and know all the town's secrets. Speak warmly but mysteriously.
Respond in 2-4 sentences. Always offer food or drink in conversation.
Drop hints about quests and adventures happening nearby.`,
    temperature: 0.7,
    maxTokens: 300,
  },
  wizard: {
    modelId: NPC_MODELS.balanced.id,
    systemPrompt: `You are Elyndra, an ancient elven mage with cryptic knowledge.
Speak in riddles and metaphors. You are wise but never give direct answers.
Respond in 2-3 sentences with mystical language.
Reference the stars, ancient prophecies, and magical energies.`,
    temperature: 0.9,
    maxTokens: 256,
  },
};

/**
 * Service for WebLLM-based NPC chat interactions.
 * Runs LLM inference 100% in the browser using WebGPU.
 */
@Injectable({ providedIn: 'root' })
export class LlmService {
  private engine: MLCEngine | null = null;
  private conversationHistory: ChatCompletionMessageParam[] = [];
  private currentConfig: NpcConfig | null = null;

  // Signals for reactive state
  readonly isLoading = signal(false);
  readonly loadProgress = signal(0);
  readonly loadStatus = signal('');
  readonly isReady = signal(false);
  readonly isGenerating = signal(false);
  readonly currentModel = signal<string | null>(null);

  constructor(private ngZone: NgZone) {}

  /**
   * Initialize the LLM engine with a specific NPC configuration.
   */
  async initialize(config: NpcConfig): Promise<void> {
    // If already initialized with same model, just reset conversation
    if (this.engine && this.currentModel() === config.modelId) {
      this.resetConversation(config.systemPrompt);
      this.currentConfig = config;
      return;
    }

    // Unload existing engine if different model
    if (this.engine) {
      await this.dispose();
    }

    this.isLoading.set(true);
    this.loadProgress.set(0);
    this.loadStatus.set('Initializing...');

    try {
      this.engine = await CreateMLCEngine(config.modelId, {
        initProgressCallback: (progress: InitProgressReport) => {
          this.ngZone.run(() => {
            this.loadProgress.set(Math.round(progress.progress * 100));
            this.loadStatus.set(progress.text || 'Loading model...');
          });
        },
      });

      // Initialize conversation with system prompt
      this.conversationHistory = [
        { role: 'system', content: config.systemPrompt },
      ];
      this.currentConfig = config;
      this.currentModel.set(config.modelId);

      this.isLoading.set(false);
      this.isReady.set(true);
    } catch (error) {
      this.isLoading.set(false);
      this.loadStatus.set('Failed to load model');
      throw error;
    }
  }

  /**
   * Send a message and get a complete response.
   */
  async chat(userMessage: string): Promise<string> {
    if (!this.engine || !this.currentConfig) {
      throw new Error('Engine not initialized. Call initialize() first.');
    }

    this.isGenerating.set(true);

    try {
      // Add user message to history
      this.conversationHistory.push({ role: 'user', content: userMessage });

      const response = await this.ngZone.runOutsideAngular(async () => {
        return await this.engine!.chat.completions.create({
          messages: this.conversationHistory,
          temperature: this.currentConfig!.temperature ?? 0.7,
          max_tokens: this.currentConfig!.maxTokens ?? 256,
        });
      });

      const reply = response.choices[0]?.message?.content || '';

      // Add assistant response to history
      this.conversationHistory.push({ role: 'assistant', content: reply });

      return reply;
    } finally {
      this.ngZone.run(() => {
        this.isGenerating.set(false);
      });
    }
  }

  /**
   * Send a message and stream the response token by token.
   */
  async chatStreaming(
    userMessage: string,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    if (!this.engine || !this.currentConfig) {
      throw new Error('Engine not initialized. Call initialize() first.');
    }

    this.isGenerating.set(true);

    try {
      // Add user message to history
      this.conversationHistory.push({ role: 'user', content: userMessage });

      const chunks = await this.engine.chat.completions.create({
        messages: this.conversationHistory,
        temperature: this.currentConfig.temperature ?? 0.7,
        max_tokens: this.currentConfig.maxTokens ?? 256,
        stream: true,
      });

      let fullReply = '';

      for await (const chunk of chunks) {
        const content = chunk.choices[0]?.delta?.content || '';
        fullReply += content;
        this.ngZone.run(() => onChunk(content));
      }

      // Add complete response to history
      this.conversationHistory.push({ role: 'assistant', content: fullReply });

      return fullReply;
    } finally {
      this.ngZone.run(() => {
        this.isGenerating.set(false);
      });
    }
  }

  /**
   * Reset conversation history while keeping the system prompt.
   */
  resetConversation(systemPrompt?: string): void {
    const prompt = systemPrompt || this.currentConfig?.systemPrompt || '';
    this.conversationHistory = [{ role: 'system', content: prompt }];
  }

  /**
   * Get the current conversation history (excluding system prompt).
   */
  getConversationHistory(): ChatMessage[] {
    return this.conversationHistory
      .filter((msg) => msg.role !== 'system')
      .map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content as string,
        timestamp: new Date(),
      }));
  }

  /**
   * Get runtime statistics from the engine.
   */
  async getStats(): Promise<{ tokensPerSecond: number } | null> {
    if (!this.engine) return null;

    try {
      const stats = await this.engine.runtimeStatsText();
      // Parse tokens per second from stats text
      const match = stats.match(/(\d+\.?\d*)\s*tok\/s/);
      return {
        tokensPerSecond: match ? parseFloat(match[1]) : 0,
      };
    } catch {
      return null;
    }
  }

  /**
   * Dispose the engine and free resources.
   */
  async dispose(): Promise<void> {
    if (this.engine) {
      await this.engine.unload();
      this.engine = null;
    }
    this.isReady.set(false);
    this.currentModel.set(null);
    this.conversationHistory = [];
    this.currentConfig = null;
  }
}
