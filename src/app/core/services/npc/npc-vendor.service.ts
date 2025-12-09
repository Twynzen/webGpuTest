import { Injectable, inject, signal, computed } from '@angular/core';
import { LlmService, NpcConfig } from '../ai/llm.service';
import {
  NpcKnowledgeService,
  KnowledgeDocument,
  KnowledgeCategory,
  KnowledgeSearchResult,
} from './npc-knowledge.service';
import { InventoryService } from './inventory.service';

/**
 * Chat message in the conversation - ONLY visible messages to the player.
 */
export interface VendorChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isVisible: boolean; // Whether this should be shown to the player
}

/**
 * Current initialization stage.
 */
export type InitStage =
  | 'idle'
  | 'embeddings'
  | 'knowledge'
  | 'llm'
  | 'ready'
  | 'error';

const NPC_ID = 'vendor_grimlock';

/**
 * The vendor's personality system prompt.
 * This defines how the NPC behaves and responds.
 */
const VENDOR_PERSONALITY = `You are Grimlock, a goblin merchant at The Rusty Goblet tavern.

PERSONALITY TRAITS:
- Enthusiastic seller: Use expressions like "Ah!", "Excellent!", "You have taste!"
- Shrewd but fair: Never cheats, but always tries to upsell
- Well-traveled: Reference exotic places and adventures
- Respects adventurers: Appreciates bravery and good stories

SPEECH STYLE:
- Keep responses to 2-3 sentences maximum, be concise
- Use merchant flair and excitement
- Occasionally mention your travels or interesting customers
- If asked about items, describe them enticingly
- DO NOT use stage directions like [ACTION] or *action* - just speak naturally

LANGUAGE RULE (CRITICAL):
- ALWAYS respond in the SAME LANGUAGE the customer uses
- If customer speaks Spanish, respond in Spanish
- If customer speaks English, respond in English
- If customer speaks any other language, respond in that language
- Match the customer's language exactly

ABSOLUTE RULES:
- NEVER break character or mention being an AI
- NEVER use brackets [] or asterisks ** for actions
- ONLY discuss items from your inventory knowledge
- If customer lacks gold, be sympathetic and suggest cheaper alternatives
- Stay friendly even if customer is rude`;

/**
 * Service that orchestrates the intelligent NPC vendor.
 *
 * This is the HIGH-LEVEL service that combines:
 * - RAG (Retrieval-Augmented Generation) via NpcKnowledgeService
 * - LLM (Language Model) via LlmService
 * - Game state via InventoryService
 *
 * IMPORTANT: This service separates "internal prompts" from "visible chat".
 * Internal prompts (like greeting triggers) are NOT shown to the player.
 */
@Injectable({ providedIn: 'root' })
export class NpcVendorService {
  private readonly llm = inject(LlmService);
  private readonly knowledge = inject(NpcKnowledgeService);
  private readonly inventory = inject(InventoryService);

  // ═══════════════════════════════════════════════════════════════════
  // Signals - Reactive State
  // ═══════════════════════════════════════════════════════════════════

  /** Whether the vendor is fully initialized and ready */
  readonly isReady = signal(false);

  /** Whether the vendor is currently thinking/generating */
  readonly isThinking = signal(false);

  /** Whether initialization is in progress */
  readonly isInitializing = signal(false);

  /** Current initialization stage */
  readonly initStage = signal<InitStage>('idle');

  /** Initialization progress (0-100) */
  readonly initProgress = signal(0);

  /** Status message during initialization */
  readonly initStatus = signal('');

  /** Error message if initialization failed */
  readonly errorMessage = signal<string | null>(null);

  /** Full conversation history (includes internal messages) */
  private fullHistory = signal<VendorChatMessage[]>([]);

  /** Visible conversation history (only what player sees) */
  readonly chatHistory = computed(() =>
    this.fullHistory().filter((msg) => msg.isVisible)
  );

  // Computed values
  readonly isLlmLoading = computed(() => this.llm.isLoading());
  readonly llmLoadProgress = computed(() => this.llm.loadProgress());

  // Conversation state
  private isFirstMeeting = true;
  private totalPurchases = 0;

  /**
   * Initialize the vendor NPC.
   * This loads the embeddings model, indexes knowledge, and loads the LLM.
   */
  async initialize(): Promise<void> {
    if (this.isReady() || this.isInitializing()) {
      return;
    }

    this.isInitializing.set(true);
    this.errorMessage.set(null);
    this.initProgress.set(0);

    try {
      // Stage 1: Initialize embeddings model
      this.initStage.set('embeddings');
      this.initStatus.set('Cargando modelo de embeddings...');
      this.initProgress.set(5);

      // Stage 2: Index knowledge base
      this.initStage.set('knowledge');
      this.initStatus.set('Indexando conocimiento del vendedor...');
      await this.knowledge.indexKnowledge(NPC_ID, VENDOR_KNOWLEDGE);
      this.initProgress.set(30);

      // Stage 3: Initialize LLM
      this.initStage.set('llm');
      this.initStatus.set('Cargando modelo de IA...');

      const config: NpcConfig = {
        modelId: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
        systemPrompt: VENDOR_PERSONALITY,
        temperature: 0.7,
        maxTokens: 150, // Shorter responses
      };

      await this.llm.initialize(config);

      // Done!
      this.initStage.set('ready');
      this.initStatus.set('Grimlock está listo para comerciar!');
      this.initProgress.set(100);
      this.isReady.set(true);

      console.log('[NpcVendor] Initialization complete');
    } catch (error) {
      this.initStage.set('error');
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Unknown error'
      );
      console.error('[NpcVendor] Initialization failed:', error);
      throw error;
    } finally {
      this.isInitializing.set(false);
    }
  }

  /**
   * Get a greeting from the vendor.
   * This is an INTERNAL prompt - the player only sees the NPC's response.
   */
  async getGreeting(): Promise<string> {
    if (!this.isReady()) {
      throw new Error('Vendor not initialized. Call initialize() first.');
    }

    this.isThinking.set(true);

    try {
      // Internal prompt - NOT visible to player
      const internalPrompt = this.isFirstMeeting
        ? 'The customer just approached. Greet them briefly and introduce yourself.'
        : 'A returning customer approaches. Welcome them back briefly.';

      // Get response using internal method (no visible user message)
      const response = await this.generateResponse(internalPrompt, false);

      // Only add the NPC's response to visible history
      this.fullHistory.update((history) => [
        ...history,
        {
          role: 'assistant',
          content: response,
          timestamp: new Date(),
          isVisible: true,
        },
      ]);

      this.isFirstMeeting = false;
      return response;
    } finally {
      this.isThinking.set(false);
    }
  }

  /**
   * Send a message to the vendor and get a response.
   * This is what the player types - both message and response are visible.
   *
   * @param message - The player's message
   * @returns The vendor's response
   */
  async chat(message: string): Promise<string> {
    if (!this.isReady()) {
      throw new Error('Vendor not initialized. Call initialize() first.');
    }

    this.isThinking.set(true);

    try {
      // Add player's message to visible history
      this.fullHistory.update((history) => [
        ...history,
        {
          role: 'user',
          content: message,
          timestamp: new Date(),
          isVisible: true,
        },
      ]);

      // Generate response
      const response = await this.generateResponse(message, true);

      // Add NPC's response to visible history
      this.fullHistory.update((history) => [
        ...history,
        {
          role: 'assistant',
          content: response,
          timestamp: new Date(),
          isVisible: true,
        },
      ]);

      this.isFirstMeeting = false;
      return response;
    } finally {
      this.isThinking.set(false);
    }
  }

  /**
   * Internal method to generate a response.
   * Handles RAG retrieval and LLM call.
   *
   * @param message - The message (could be internal prompt or player message)
   * @param isPlayerMessage - Whether this is from the player (affects context)
   */
  private async generateResponse(
    message: string,
    isPlayerMessage: boolean
  ): Promise<string> {
    // Retrieve relevant knowledge using RAG
    const relevantKnowledge = await this.knowledge.search(NPC_ID, message, {
      topK: 3,
      minScore: 0.2,
    });

    // Build augmented context
    const augmentedMessage = this.buildAugmentedMessage(
      message,
      relevantKnowledge,
      isPlayerMessage
    );

    // Get LLM response
    const response = await this.llm.chat(augmentedMessage);

    // Clean up response (remove any accidental stage directions)
    return this.cleanResponse(response);
  }

  /**
   * Clean the LLM response to remove unwanted formatting.
   */
  private cleanResponse(response: string): string {
    // Remove [BRACKETED TEXT] stage directions
    let cleaned = response.replace(/\[[^\]]*\]/g, '');

    // Remove *asterisk actions*
    cleaned = cleaned.replace(/\*[^*]*\*/g, '');

    // Remove extra whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
  }

  /**
   * Record that a purchase was made (updates NPC knowledge of player).
   */
  recordPurchase(amount: number): void {
    this.totalPurchases += amount;
  }

  /**
   * Reset the conversation state.
   */
  resetConversation(): void {
    this.llm.resetConversation();
    this.fullHistory.set([]);
    this.isFirstMeeting = true;
  }

  /**
   * Get all indexed knowledge for debugging.
   */
  getKnowledge(): KnowledgeDocument[] {
    return this.knowledge.getAllKnowledge(NPC_ID);
  }

  /**
   * Cleanup resources.
   */
  async dispose(): Promise<void> {
    await this.llm.dispose();
    this.knowledge.clearKnowledge(NPC_ID);
    this.isReady.set(false);
    this.fullHistory.set([]);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Private Methods
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Build the augmented message with RAG context and game state.
   */
  private buildAugmentedMessage(
    userMessage: string,
    knowledge: KnowledgeSearchResult[],
    isPlayerMessage: boolean
  ): string {
    const gameState = {
      gold: this.inventory.playerGold(),
      hp: this.inventory.playerHP(),
      maxHp: this.inventory.playerMaxHP(),
    };

    // Build context sections
    let context = `[CONTEXT - Do not mention these details directly]
Customer gold: ${gameState.gold} | HP: ${gameState.hp}/${gameState.maxHp}
Meeting: ${this.isFirstMeeting ? 'First time' : 'Returning'}
`;

    if (knowledge.length > 0) {
      context += `\nRelevant info:\n`;
      knowledge.forEach((result, i) => {
        context += `- ${result.document.text}\n`;
      });
    }

    if (isPlayerMessage) {
      context += `\nCustomer says: "${userMessage}"`;
    } else {
      context += `\nSituation: ${userMessage}`;
    }

    context += `\n\nRespond naturally in 2-3 sentences. Match the customer's language.`;

    return context;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VENDOR KNOWLEDGE BASE
// ═══════════════════════════════════════════════════════════════════════════

const VENDOR_KNOWLEDGE: KnowledgeDocument[] = [
  // INVENTORY - Healing
  {
    id: 'item_health_potion',
    category: KnowledgeCategory.INVENTORY,
    text: 'Poción de Salud / Health Potion: Restaura 50 HP. Precio: 25 oro.',
    metadata: { itemId: 'health_potion', price: 25 },
  },
  {
    id: 'item_mega_health',
    category: KnowledgeCategory.INVENTORY,
    text: 'Elixir Mega Salud / Mega Health: Restaura todo el HP. Precio: 500 oro. Muy raro.',
    metadata: { itemId: 'mega_health', price: 500 },
  },
  {
    id: 'item_healing_herb',
    category: KnowledgeCategory.INVENTORY,
    text: 'Hierba Curativa / Healing Herb: Restaura 20 HP gradualmente. Precio: 10 oro.',
    metadata: { itemId: 'healing_herb', price: 10 },
  },
  {
    id: 'item_mana_crystal',
    category: KnowledgeCategory.INVENTORY,
    text: 'Cristal de Maná / Mana Crystal: Restaura 100 MP. Precio: 40 oro.',
    metadata: { itemId: 'mana_crystal', price: 40 },
  },

  // INVENTORY - Defense
  {
    id: 'item_shield_charm',
    category: KnowledgeCategory.INVENTORY,
    text: 'Amuleto Escudo / Shield Charm: Reduce daño 25% por 60 segundos. Precio: 75 oro.',
    metadata: { itemId: 'shield_charm', price: 75 },
  },
  {
    id: 'item_iron_shield',
    category: KnowledgeCategory.INVENTORY,
    text: 'Escudo de Hierro / Iron Shield: Bloquea 40% daño físico permanente. Precio: 200 oro.',
    metadata: { itemId: 'iron_shield', price: 200 },
  },

  // INVENTORY - Weapons
  {
    id: 'item_iron_sword',
    category: KnowledgeCategory.INVENTORY,
    text: 'Espada de Hierro / Iron Sword: 25 de daño. Precio: 100 oro.',
    metadata: { itemId: 'iron_sword', price: 100 },
  },
  {
    id: 'item_fire_blade',
    category: KnowledgeCategory.INVENTORY,
    text: 'Espada de Fuego / Fire Blade: 30 daño + 15 fuego. Precio: 350 oro. Rara.',
    metadata: { itemId: 'fire_blade', price: 350 },
  },
  {
    id: 'item_poison_dagger',
    category: KnowledgeCategory.INVENTORY,
    text: 'Daga Venenosa / Poison Dagger: 15 daño + veneno. Precio: 180 oro.',
    metadata: { itemId: 'poison_dagger', price: 180 },
  },

  // LORE
  {
    id: 'lore_backstory',
    category: KnowledgeCategory.LORE,
    text: 'Soy Grimlock, un goblin comerciante. He viajado por tres continentes y comerciado con dragones.',
  },
  {
    id: 'lore_personality',
    category: KnowledgeCategory.LORE,
    text: 'Grimlock es honesto y justo. Nunca engaña a los clientes. La reputación vale más que el oro.',
  },

  // ENVIRONMENT
  {
    id: 'env_location',
    category: KnowledgeCategory.ENVIRONMENT,
    text: 'Esta es La Copa Oxidada / The Rusty Goblet, una famosa taberna en el cruce de tres reinos.',
  },

  // BEHAVIORS
  {
    id: 'behavior_greeting',
    category: KnowledgeCategory.BEHAVIOR,
    text: 'Al saludar: Ser cálido y breve. Presentarse como Grimlock. Preguntar qué necesitan.',
  },
  {
    id: 'behavior_no_gold',
    category: KnowledgeCategory.BEHAVIOR,
    text: 'Si no tienen oro: Ser comprensivo. Sugerir alternativas baratas. Animarlos a volver.',
  },
];
