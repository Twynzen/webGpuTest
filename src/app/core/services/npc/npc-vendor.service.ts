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
 * Chat message in the conversation.
 */
export interface VendorChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
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
- Keep responses to 2-4 sentences
- Use merchant flair and excitement
- Occasionally mention your travels or interesting customers
- If asked about items, describe them enticingly

ABSOLUTE RULES:
- NEVER break character or mention being an AI
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
 * HOW IT WORKS:
 * 1. User sends a message
 * 2. RAG searches for relevant knowledge (items, lore, behaviors)
 * 3. Context is built from: RAG results + game state + conversation
 * 4. LLM generates a contextual, in-character response
 *
 * USAGE:
 * ```typescript
 * // Initialize the vendor
 * await vendorService.initialize();
 *
 * // Start conversation
 * const greeting = await vendorService.getGreeting();
 *
 * // Chat
 * const response = await vendorService.chat("What potions do you have?");
 * ```
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

  /** Conversation history */
  readonly chatHistory = signal<VendorChatMessage[]>([]);

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
      this.initStatus.set('Loading embeddings model...');
      this.initProgress.set(5);

      // Stage 2: Index knowledge base
      this.initStage.set('knowledge');
      this.initStatus.set('Indexing vendor knowledge...');
      await this.knowledge.indexKnowledge(NPC_ID, VENDOR_KNOWLEDGE);
      this.initProgress.set(30);

      // Stage 3: Initialize LLM
      this.initStage.set('llm');
      this.initStatus.set('Loading AI model...');

      const config: NpcConfig = {
        modelId: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
        systemPrompt: VENDOR_PERSONALITY,
        temperature: 0.8,
        maxTokens: 300,
      };

      await this.llm.initialize(config);

      // Done!
      this.initStage.set('ready');
      this.initStatus.set('Grimlock is ready to trade!');
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
   * Different greetings for first meeting vs. returning customer.
   */
  async getGreeting(): Promise<string> {
    if (!this.isReady()) {
      throw new Error('Vendor not initialized. Call initialize() first.');
    }

    const prompt = this.isFirstMeeting
      ? 'A new customer just walked up to your shop counter for the first time. Greet them warmly and introduce yourself briefly.'
      : 'A returning customer has come back to your shop. Welcome them back and maybe mention something about new stock.';

    return this.chat(prompt);
  }

  /**
   * Send a message to the vendor and get a response.
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
      // Step 1: Retrieve relevant knowledge using RAG
      const relevantKnowledge = await this.knowledge.search(NPC_ID, message, {
        topK: 4,
        minScore: 0.2,
      });

      // Step 2: Build augmented context
      const augmentedMessage = this.buildAugmentedMessage(
        message,
        relevantKnowledge
      );

      // Step 3: Get LLM response
      const response = await this.llm.chat(augmentedMessage);

      // Step 4: Update conversation history
      this.chatHistory.update((history) => [
        ...history,
        { role: 'user', content: message, timestamp: new Date() },
        { role: 'assistant', content: response, timestamp: new Date() },
      ]);

      // Update state
      this.isFirstMeeting = false;

      return response;
    } finally {
      this.isThinking.set(false);
    }
  }

  /**
   * Stream a response token by token.
   *
   * @param message - The player's message
   * @param onChunk - Callback for each token
   * @returns The complete response
   */
  async chatStreaming(
    message: string,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    if (!this.isReady()) {
      throw new Error('Vendor not initialized. Call initialize() first.');
    }

    this.isThinking.set(true);

    try {
      // Retrieve knowledge
      const relevantKnowledge = await this.knowledge.search(NPC_ID, message, {
        topK: 4,
        minScore: 0.2,
      });

      // Build context
      const augmentedMessage = this.buildAugmentedMessage(
        message,
        relevantKnowledge
      );

      // Stream response
      const response = await this.llm.chatStreaming(augmentedMessage, onChunk);

      // Update history
      this.chatHistory.update((history) => [
        ...history,
        { role: 'user', content: message, timestamp: new Date() },
        { role: 'assistant', content: response, timestamp: new Date() },
      ]);

      this.isFirstMeeting = false;

      return response;
    } finally {
      this.isThinking.set(false);
    }
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
    this.chatHistory.set([]);
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
    this.chatHistory.set([]);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Private Methods
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Build the augmented message with RAG context and game state.
   */
  private buildAugmentedMessage(
    userMessage: string,
    knowledge: KnowledgeSearchResult[]
  ): string {
    const gameState = {
      gold: this.inventory.playerGold(),
      hp: this.inventory.playerHP(),
      maxHp: this.inventory.playerMaxHP(),
      mp: this.inventory.playerMP(),
    };

    // Build context sections
    let context = `[CUSTOMER STATUS]
- Gold: ${gameState.gold}
- Health: ${gameState.hp}/${gameState.maxHp}
- Meeting type: ${this.isFirstMeeting ? 'First time customer' : 'Returning customer'}
- Total purchases: ${this.totalPurchases} gold spent

`;

    if (knowledge.length > 0) {
      context += `[YOUR RELEVANT KNOWLEDGE]\n`;
      knowledge.forEach((result, i) => {
        context += `${i + 1}. ${result.document.text}\n`;
      });
      context += '\n';
    }

    context += `[CUSTOMER SAYS]: "${userMessage}"`;

    return context;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VENDOR KNOWLEDGE BASE
// This is all the knowledge that the vendor NPC "knows"
// ═══════════════════════════════════════════════════════════════════════════

const VENDOR_KNOWLEDGE: KnowledgeDocument[] = [
  // ═══════════════════════════════════════════════════════════════════
  // INVENTORY - Healing Items
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'item_health_potion',
    category: KnowledgeCategory.INVENTORY,
    text: 'Health Potion: A red bubbling liquid that restores 50 HP instantly. Price: 25 gold. Very popular with adventurers. Always in stock.',
    metadata: { itemId: 'health_potion', price: 25, type: 'healing' },
  },
  {
    id: 'item_mega_health',
    category: KnowledgeCategory.INVENTORY,
    text: 'Mega Health Elixir: Legendary golden potion that fully restores HP and grants temporary vitality boost. Price: 500 gold. Extremely rare, I only have a few.',
    metadata: { itemId: 'mega_health', price: 500, type: 'healing' },
  },
  {
    id: 'item_healing_herb',
    category: KnowledgeCategory.INVENTORY,
    text: 'Healing Herb: Natural remedy that slowly restores 20 HP over time. Price: 10 gold. Good for light wounds and budget-conscious adventurers.',
    metadata: { itemId: 'healing_herb', price: 10, type: 'healing' },
  },
  {
    id: 'item_mana_crystal',
    category: KnowledgeCategory.INVENTORY,
    text: 'Mana Crystal: Glowing blue gem that restores 100 MP instantly. Price: 40 gold. Essential for spellcasters and mages.',
    metadata: { itemId: 'mana_crystal', price: 40, type: 'mana' },
  },

  // ═══════════════════════════════════════════════════════════════════
  // INVENTORY - Defense Items
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'item_shield_charm',
    category: KnowledgeCategory.INVENTORY,
    text: 'Shield Charm: Enchanted protective amulet that reduces incoming damage by 25% for one minute. Price: 75 gold. Popular among those entering dangerous areas.',
    metadata: { itemId: 'shield_charm', price: 75, type: 'defense' },
  },
  {
    id: 'item_iron_shield',
    category: KnowledgeCategory.INVENTORY,
    text: 'Iron Shield: Sturdy defensive equipment that permanently blocks 40% of physical damage when equipped. Price: 200 gold. Solid investment for warriors.',
    metadata: { itemId: 'iron_shield', price: 200, type: 'defense' },
  },
  {
    id: 'item_dragon_shield',
    category: KnowledgeCategory.INVENTORY,
    text: 'Dragon Shield: Legendary shield forged from actual dragon scales. Blocks 60% damage and grants fire resistance. Price: 1000 gold. My rarest defensive item.',
    metadata: { itemId: 'dragon_shield', price: 1000, type: 'defense' },
  },

  // ═══════════════════════════════════════════════════════════════════
  // INVENTORY - Weapons
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'item_iron_sword',
    category: KnowledgeCategory.INVENTORY,
    text: 'Iron Sword: Reliable basic sword dealing 25 damage. Price: 100 gold. Good starter weapon for new adventurers.',
    metadata: { itemId: 'iron_sword', price: 100, type: 'weapon' },
  },
  {
    id: 'item_fire_blade',
    category: KnowledgeCategory.INVENTORY,
    text: 'Fire Blade: Magnificent sword enchanted with eternal flames. Deals 30 physical plus 15 fire damage. Enemies may catch fire. Price: 350 gold. I got this from a fire mage.',
    metadata: { itemId: 'fire_blade', price: 350, type: 'weapon' },
  },
  {
    id: 'item_poison_dagger',
    category: KnowledgeCategory.INVENTORY,
    text: 'Poison Dagger: Quick striking dagger coated with deadly venom. Deals 15 damage plus poison effect. Price: 180 gold. Favorite of rogues and assassins.',
    metadata: { itemId: 'poison_dagger', price: 180, type: 'weapon' },
  },
  {
    id: 'item_thunder_hammer',
    category: KnowledgeCategory.INVENTORY,
    text: 'Thunder Hammer: Massive war hammer crackling with lightning. Deals 50 damage with chance to stun enemies. Price: 600 gold. Dwarven craftsmanship.',
    metadata: { itemId: 'thunder_hammer', price: 600, type: 'weapon' },
  },
  {
    id: 'item_shadow_blade',
    category: KnowledgeCategory.INVENTORY,
    text: 'Shadow Blade: Legendary blade that phases through armor. Deals 40 true damage that ignores all defenses. Price: 800 gold. My most valuable weapon.',
    metadata: { itemId: 'shadow_blade', price: 800, type: 'weapon' },
  },
  {
    id: 'item_strength_potion',
    category: KnowledgeCategory.INVENTORY,
    text: 'Strength Potion: Muscle-enhancing brew that increases damage dealt by 20% for 60 seconds. Price: 80 gold. Warriors love this before big fights.',
    metadata: { itemId: 'strength_potion', price: 80, type: 'buff' },
  },

  // ═══════════════════════════════════════════════════════════════════
  // LORE - Backstory
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'lore_backstory_1',
    category: KnowledgeCategory.LORE,
    text: 'I am Grimlock, a goblin merchant who has traveled across three continents. I once traded with dragons in the Northern Peaks and barely escaped with my life and a fortune in dragon-touched items.',
  },
  {
    id: 'lore_backstory_2',
    category: KnowledgeCategory.LORE,
    text: 'I survived the Merchant Wars of the Eastern Kingdoms where trade guilds fought bloody battles. That experience taught me the value of fair dealing and building trust with customers.',
  },
  {
    id: 'lore_personality',
    category: KnowledgeCategory.LORE,
    text: 'Grimlock takes pride in honest business. I never sell fake or cursed items. My reputation is worth more than short-term profit. Customers who return are the foundation of good trade.',
  },

  // ═══════════════════════════════════════════════════════════════════
  // ENVIRONMENT - Location
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'env_location',
    category: KnowledgeCategory.ENVIRONMENT,
    text: 'This is The Rusty Goblet, a famous tavern and trading post located at the crossroads of three kingdoms. Adventurers from all lands pass through here seeking supplies and information.',
  },
  {
    id: 'env_ambiance',
    category: KnowledgeCategory.ENVIRONMENT,
    text: 'The tavern is dimly lit with warm torchlight. The smell of ale and roasted meat fills the air. Mercenaries discuss quests at nearby tables while a bard plays soft music in the corner.',
  },
  {
    id: 'env_reputation',
    category: KnowledgeCategory.ENVIRONMENT,
    text: 'The Rusty Goblet is known throughout the land for fair deals and rare goods. Many adventurers specifically travel here to visit my shop before embarking on dangerous quests.',
  },

  // ═══════════════════════════════════════════════════════════════════
  // BEHAVIOR - Greetings
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'behavior_greeting_new',
    category: KnowledgeCategory.BEHAVIOR,
    text: 'When greeting a new customer: Be warm and enthusiastic. Introduce yourself as Grimlock. Mention you have goods for every type of adventurer. Ask what brings them to the tavern.',
  },
  {
    id: 'behavior_greeting_return',
    category: KnowledgeCategory.BEHAVIOR,
    text: 'When a returning customer arrives: Welcome them back warmly. Remember they are valued. Mention any new items you have acquired. Ask about their latest adventures.',
  },

  // ═══════════════════════════════════════════════════════════════════
  // BEHAVIOR - Sales
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'behavior_no_gold',
    category: KnowledgeCategory.BEHAVIOR,
    text: 'When customer cannot afford an item: Be sympathetic, not judgmental. Suggest cheaper alternatives. Encourage them to return after their next quest. Never mock poor customers.',
  },
  {
    id: 'behavior_haggle',
    category: KnowledgeCategory.BEHAVIOR,
    text: 'When customer wants to haggle: Offer 10% discount if they buy two or more items. Never go below that. Explain your prices are already fair. Respect their attempt to negotiate.',
  },
  {
    id: 'behavior_recommend',
    category: KnowledgeCategory.BEHAVIOR,
    text: 'When recommending items: Ask about their quest or needs first. Suggest appropriate items based on their situation. If they look wounded, suggest healing items. If they mention combat, suggest weapons.',
  },

  // ═══════════════════════════════════════════════════════════════════
  // WORLD - Quests and Dangers
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'world_dangers',
    category: KnowledgeCategory.WORLD,
    text: 'The roads outside the tavern are dangerous. Bandits roam the Western Pass. Wolf packs hunt in the Northern Forest. The Eastern Swamps are full of poisonous creatures.',
  },
  {
    id: 'world_quests',
    category: KnowledgeCategory.WORLD,
    text: 'I hear the Mayor is looking for adventurers to clear the goblin caves to the east. The reward is 200 gold. Those goblins give us merchant goblins a bad name.',
  },
  {
    id: 'world_rumors',
    category: KnowledgeCategory.WORLD,
    text: 'Rumor has it there is a dragon spotted near the mountain pass. Smart adventurers are stocking up on fire resistance and healing before investigating. Could be profitable if you survive.',
  },
  {
    id: 'world_secrets',
    category: KnowledgeCategory.WORLD,
    text: 'Secret: There is a hidden dungeon beneath this very tavern containing ancient treasures. I only share this with customers who have spent more than 500 gold with me. Very exclusive information.',
  },
];
