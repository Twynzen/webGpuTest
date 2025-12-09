# RAG-Enhanced NPC System - Complete Technical Documentation

> **Purpose**: This document provides exhaustive technical detail for implementing intelligent NPCs using RAG (Retrieval-Augmented Generation) with WebGPU-accelerated AI models running 100% in the browser. Written so that another AI assistant (Claude Code) can implement this system by reading this document alone.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Core Technologies Explained](#2-core-technologies-explained)
3. [RAG System Deep Dive](#3-rag-system-deep-dive)
4. [NPC Knowledge Base Structure](#4-npc-knowledge-base-structure)
5. [Implementation Guide](#5-implementation-guide)
6. [Service Specifications](#6-service-specifications)
7. [3D Integration with Three.js](#7-3d-integration-with-threejs)
8. [Complete Code Examples](#8-complete-code-examples)
9. [Performance Optimization](#9-performance-optimization)
10. [Extending the System](#10-extending-the-system)

---

## 1. Architecture Overview

### 1.1 System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BROWSER ENVIRONMENT                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                        3D GAME WORLD (Three.js)                        │ │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────────┐ │ │
│  │  │   PLAYER    │    │  NPC CUBE   │    │      ENVIRONMENT            │ │ │
│  │  │  (Capsule)  │───▶│  (Vendor)   │    │  (Bar/Shop Room)            │ │ │
│  │  │  WASD move  │    │  Proximity  │    │  Lights, Floor, Walls       │ │ │
│  │  └─────────────┘    │  Detection  │    └─────────────────────────────┘ │ │
│  │                     └──────┬──────┘                                    │ │
│  └────────────────────────────┼───────────────────────────────────────────┘ │
│                               │ [E] Key Pressed                              │
│                               ▼                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                      INTERACTION LAYER                                 │ │
│  │                                                                        │ │
│  │  User Input ──▶ Context Builder ──▶ RAG Query ──▶ LLM Prompt          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                               │                                              │
│                               ▼                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                         AI LAYER                                       │ │
│  │                                                                        │ │
│  │  ┌──────────────────────┐      ┌──────────────────────────────────┐   │ │
│  │  │   EMBEDDINGS SERVICE │      │         LLM SERVICE               │   │ │
│  │  │   (Transformers.js)  │      │         (WebLLM/MLC)              │   │ │
│  │  │                      │      │                                   │   │ │
│  │  │  • Xenova/MiniLM     │      │  • SmolLM2-360M (376MB VRAM)     │   │ │
│  │  │  • 384 dimensions    │      │  • Llama-3.2-1B (879MB VRAM)     │   │ │
│  │  │  • WebGPU accelerated│      │  • Llama-3.2-3B (2.2GB VRAM)     │   │ │
│  │  │  • ~22MB model size  │      │  • WebGPU accelerated            │   │ │
│  │  └──────────┬───────────┘      └───────────────┬──────────────────┘   │ │
│  │             │                                   │                      │ │
│  │             ▼                                   ▼                      │ │
│  │  ┌──────────────────────┐      ┌──────────────────────────────────┐   │ │
│  │  │   VECTOR DATABASE    │      │      CONVERSATION MEMORY         │   │ │
│  │  │   (In-Memory)        │      │      (Chat History)              │   │ │
│  │  │                      │      │                                   │   │ │
│  │  │  • Cosine similarity │      │  • System prompt                 │   │ │
│  │  │  • Top-K retrieval   │      │  • User/Assistant messages       │   │ │
│  │  │  • Metadata filtering│      │  • RAG context injection         │   │ │
│  │  └──────────────────────┘      └──────────────────────────────────┘   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                     KNOWLEDGE BASE                                     │ │
│  │                                                                        │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │ │
│  │  │  INVENTORY  │  │    LORE     │  │ ENVIRONMENT │  │  BEHAVIORS  │   │ │
│  │  │             │  │             │  │             │  │             │   │ │
│  │  │ Items       │  │ Backstory   │  │ Location    │  │ Greetings   │   │ │
│  │  │ Prices      │  │ Personality │  │ Time        │  │ Sales pitch │   │ │
│  │  │ Effects     │  │ Secrets     │  │ Ambiance    │  │ Reactions   │   │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Data Flow Sequence

```
┌─────────┐     ┌─────────┐     ┌─────────────┐     ┌─────────┐     ┌─────────┐
│ Player  │     │  3D     │     │ NPC Vendor  │     │  RAG    │     │   LLM   │
│ Input   │     │ Scene   │     │  Service    │     │ Engine  │     │ Service │
└────┬────┘     └────┬────┘     └──────┬──────┘     └────┬────┘     └────┬────┘
     │               │                 │                 │               │
     │ [E] Press     │                 │                 │               │
     ├──────────────▶│                 │                 │               │
     │               │ Proximity OK    │                 │               │
     │               ├────────────────▶│                 │               │
     │               │                 │                 │               │
     │ "Show items"  │                 │                 │               │
     ├───────────────┼────────────────▶│                 │               │
     │               │                 │                 │               │
     │               │                 │ Query: "items"  │               │
     │               │                 ├────────────────▶│               │
     │               │                 │                 │               │
     │               │                 │ Top-3 Results   │               │
     │               │                 │◀────────────────┤               │
     │               │                 │                 │               │
     │               │                 │ Prompt + Context│               │
     │               │                 ├────────────────────────────────▶│
     │               │                 │                 │               │
     │               │                 │                 │    Response   │
     │               │                 │◀────────────────────────────────┤
     │               │                 │                 │               │
     │               │  Display Chat   │                 │               │
     │◀──────────────┼─────────────────┤                 │               │
     │               │                 │                 │               │
```

---

## 2. Core Technologies Explained

### 2.1 WebGPU - The Foundation

**What is WebGPU?**
WebGPU is a modern graphics and compute API for the web that provides access to GPU hardware. Unlike WebGL, it's designed for general-purpose GPU computing (GPGPU), making it perfect for AI inference.

**Why WebGPU for NPCs?**
- **Speed**: GPU parallel processing is 10-100x faster than CPU for matrix operations
- **Local**: All computation happens in user's browser - no server costs
- **Privacy**: User data never leaves the device
- **Caching**: Models are cached in IndexedDB after first download

**Checking WebGPU Support:**
```typescript
async function checkWebGPU(): Promise<{ supported: boolean; adapter: GPUAdapter | null }> {
  if (!navigator.gpu) {
    return { supported: false, adapter: null };
  }

  const adapter = await navigator.gpu.requestAdapter();
  return {
    supported: adapter !== null,
    adapter
  };
}
```

### 2.2 WebLLM (MLC-AI) - The Brain

**What is WebLLM?**
WebLLM is a library that runs Large Language Models entirely in the browser using WebGPU. It uses MLC (Machine Learning Compilation) to optimize models for web deployment.

**How it works:**
1. **Model Download**: First visit downloads the model (~300MB-2GB depending on model)
2. **Caching**: Model is stored in browser's Cache Storage
3. **Compilation**: Model is compiled to WebGPU shaders
4. **Inference**: Runs entirely on GPU with streaming output

**Key Code Pattern:**
```typescript
import { CreateMLCEngine, MLCEngine } from '@mlc-ai/web-llm';

// Initialize engine with progress tracking
const engine: MLCEngine = await CreateMLCEngine(
  'Llama-3.2-1B-Instruct-q4f16_1-MLC',  // Model ID
  {
    initProgressCallback: (progress) => {
      console.log(`Loading: ${progress.progress * 100}% - ${progress.text}`);
    }
  }
);

// Chat completion
const response = await engine.chat.completions.create({
  messages: [
    { role: 'system', content: 'You are a merchant NPC.' },
    { role: 'user', content: 'What do you sell?' }
  ],
  temperature: 0.7,
  max_tokens: 256,
  stream: true  // Enable streaming for real-time response
});

// Process streaming response
for await (const chunk of response) {
  const content = chunk.choices[0]?.delta?.content || '';
  process.stdout.write(content);
}
```

**Available Models (Recommended for NPCs):**

| Model | VRAM | Use Case | Quality |
|-------|------|----------|---------|
| SmolLM2-360M-Instruct | 376 MB | Mobile, simple NPCs | Basic |
| Llama-3.2-1B-Instruct | 879 MB | Balanced, most NPCs | Good |
| Llama-3.2-3B-Instruct | 2.26 GB | Complex NPCs | Excellent |
| Phi-3.5-mini-instruct | 3.67 GB | Advanced reasoning | Best |

### 2.3 Transformers.js - Embeddings for RAG

**What is Transformers.js?**
A JavaScript library by Hugging Face that runs transformer models in the browser. We use it specifically for generating text embeddings.

**What are Embeddings?**
Embeddings are numerical representations of text (vectors) that capture semantic meaning. Similar texts have similar vectors, enabling semantic search.

**Example:**
```
"Health Potion"     → [0.12, -0.45, 0.78, ..., 0.33]  (384 numbers)
"Healing medicine"  → [0.11, -0.43, 0.76, ..., 0.31]  (Very similar!)
"Sword of Fire"     → [-0.89, 0.22, 0.01, ..., -0.55] (Very different)
```

**Key Code Pattern:**
```typescript
import { pipeline, FeatureExtractionPipeline } from '@huggingface/transformers';

// Initialize embedding model (downloads ~22MB on first use)
const extractor: FeatureExtractionPipeline = await pipeline(
  'feature-extraction',
  'Xenova/all-MiniLM-L6-v2',
  { device: 'webgpu' }  // Use GPU acceleration
);

// Generate embeddings
const output = await extractor(['Health Potion', 'Sword of Fire'], {
  pooling: 'mean',      // Average all token embeddings
  normalize: true       // Normalize to unit vectors (required for cosine similarity)
});

const embeddings: number[][] = output.tolist();
// embeddings[0] = [0.12, -0.45, ...] (384 dimensions)
// embeddings[1] = [-0.89, 0.22, ...] (384 dimensions)
```

---

## 3. RAG System Deep Dive

### 3.1 What is RAG?

**RAG = Retrieval-Augmented Generation**

RAG solves a fundamental problem: LLMs have fixed knowledge from training and can't know specific information about YOUR game world, YOUR items, YOUR NPCs.

**The Solution:**
1. **Store** your custom knowledge as text documents
2. **Convert** documents to embeddings (vectors)
3. **When user asks a question**: Find relevant documents by semantic similarity
4. **Inject** those documents into the LLM prompt
5. **LLM responds** using the provided context

### 3.2 RAG Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           RAG PIPELINE                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ STEP 1: INDEXING (Done once at startup)                             ││
│  │                                                                      ││
│  │  Knowledge Documents           Embedding Model         Vector Store  ││
│  │  ┌─────────────────┐          ┌─────────────┐       ┌─────────────┐ ││
│  │  │ "Health Potion: │          │             │       │ doc_0: [...]│ ││
│  │  │  Heals 50 HP,   │─────────▶│  MiniLM-L6  │──────▶│ doc_1: [...]│ ││
│  │  │  costs 25g"     │          │  (22MB)     │       │ doc_2: [...]│ ││
│  │  │ "Fire Sword..." │          │             │       │     ...     │ ││
│  │  └─────────────────┘          └─────────────┘       └─────────────┘ ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ STEP 2: RETRIEVAL (On each user query)                              ││
│  │                                                                      ││
│  │  User Query          Query Embedding        Similarity Search        ││
│  │  ┌─────────────┐    ┌─────────────┐       ┌─────────────────────┐   ││
│  │  │"What heals?"│───▶│ [0.1, -0.3, │──────▶│ cosine(query, doc_i)│   ││
│  │  │             │    │  0.8, ...]  │       │ for all documents   │   ││
│  │  └─────────────┘    └─────────────┘       └──────────┬──────────┘   ││
│  │                                                       │              ││
│  │                                           ┌───────────▼───────────┐  ││
│  │                                           │ Top-K Results:        │  ││
│  │                                           │ 1. "Health Potion..." │  ││
│  │                                           │ 2. "Life Elixir..."   │  ││
│  │                                           │ 3. "Healing Herb..."  │  ││
│  │                                           └───────────────────────┘  ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ STEP 3: GENERATION (Create final response)                          ││
│  │                                                                      ││
│  │  ┌─────────────────────────────────────────────────────────────────┐││
│  │  │                    AUGMENTED PROMPT                              │││
│  │  │                                                                  │││
│  │  │  System: You are Grimlock, a goblin merchant...                 │││
│  │  │                                                                  │││
│  │  │  [CONTEXT FROM RAG]                                             │││
│  │  │  - Health Potion: Restores 50 HP. Price: 25 gold.               │││
│  │  │  - Life Elixir: Full HP restore. Price: 100 gold.               │││
│  │  │  - Healing Herb: Restores 20 HP over time. Price: 10 gold.      │││
│  │  │                                                                  │││
│  │  │  User: What heals?                                              │││
│  │  │                                                                  │││
│  │  └─────────────────────────────────────────────────────────────────┘││
│  │                           │                                          ││
│  │                           ▼                                          ││
│  │                    ┌─────────────┐                                   ││
│  │                    │    LLM      │                                   ││
│  │                    │  (WebLLM)   │                                   ││
│  │                    └──────┬──────┘                                   ││
│  │                           │                                          ││
│  │                           ▼                                          ││
│  │  ┌─────────────────────────────────────────────────────────────────┐││
│  │  │ "Ah, looking to patch yourself up? I've got just the things!    │││
│  │  │  Try my Health Potions - 50 HP for only 25 gold! Or if you're   │││
│  │  │  really hurting, the Life Elixir does a full restore for 100g." │││
│  │  └─────────────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Cosine Similarity Explained

Cosine similarity measures how similar two vectors are, regardless of their magnitude. For normalized vectors (length = 1), it equals the dot product.

```typescript
/**
 * Calculate cosine similarity between two normalized vectors.
 * Returns value between -1 (opposite) and 1 (identical).
 *
 * @example
 * cosineSimilarity([1, 0], [1, 0])    // 1.0 (identical)
 * cosineSimilarity([1, 0], [0, 1])    // 0.0 (orthogonal)
 * cosineSimilarity([1, 0], [-1, 0])   // -1.0 (opposite)
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
  }
  return dotProduct;
}

// Real example with embeddings:
const healthPotion = await embed("Health Potion heals 50 HP");     // [0.12, -0.45, ...]
const healingQuery = await embed("What can heal me?");             // [0.11, -0.43, ...]
const swordQuery = await embed("What weapons do you have?");       // [-0.89, 0.22, ...]

cosineSimilarity(healthPotion, healingQuery);  // ~0.92 (very similar!)
cosineSimilarity(healthPotion, swordQuery);    // ~0.15 (not similar)
```

---

## 4. NPC Knowledge Base Structure

### 4.1 Document Categories

The NPC knowledge base should be organized into categories for better retrieval:

```typescript
export enum KnowledgeCategory {
  INVENTORY = 'inventory',      // Items for sale
  LORE = 'lore',               // NPC backstory, personality
  ENVIRONMENT = 'environment',  // Location, ambiance
  BEHAVIOR = 'behavior',        // Greetings, reactions
  WORLD = 'world',             // Game world info
}

export interface KnowledgeDocument {
  id: string;
  text: string;
  category: KnowledgeCategory;
  metadata?: {
    itemId?: string;
    price?: number;
    rarity?: 'common' | 'uncommon' | 'rare' | 'legendary';
    [key: string]: unknown;
  };
}
```

### 4.2 Example Knowledge Base for Vendor NPC

```typescript
const VENDOR_KNOWLEDGE: KnowledgeDocument[] = [
  // ═══════════════════════════════════════════════════════════════════
  // INVENTORY - Items the NPC sells
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'item_health_potion',
    category: KnowledgeCategory.INVENTORY,
    text: 'Health Potion: A red bubbling liquid that restores 50 HP instantly. Price: 25 gold. Common item, always in stock.',
    metadata: { itemId: 'health_potion', price: 25, rarity: 'common' }
  },
  {
    id: 'item_mega_health',
    category: KnowledgeCategory.INVENTORY,
    text: 'Mega Health Elixir: Legendary golden potion that fully restores HP and grants 10% max HP bonus for 5 minutes. Price: 500 gold. Very rare, limited stock.',
    metadata: { itemId: 'mega_health', price: 500, rarity: 'legendary' }
  },
  {
    id: 'item_shield_charm',
    category: KnowledgeCategory.INVENTORY,
    text: 'Shield Charm: Enchanted amulet that reduces all incoming damage by 25% for 60 seconds. Price: 75 gold. Uncommon item.',
    metadata: { itemId: 'shield_charm', price: 75, rarity: 'uncommon' }
  },
  {
    id: 'item_iron_shield',
    category: KnowledgeCategory.INVENTORY,
    text: 'Iron Shield: Sturdy defensive equipment that blocks 40% of physical damage. Can be equipped permanently. Price: 200 gold.',
    metadata: { itemId: 'iron_shield', price: 200, rarity: 'uncommon' }
  },
  {
    id: 'item_fire_blade',
    category: KnowledgeCategory.INVENTORY,
    text: 'Fire Blade: Sword enchanted with eternal flames. Deals 30 base damage plus 15 fire damage. Enemies may catch fire. Price: 350 gold. Rare item.',
    metadata: { itemId: 'fire_blade', price: 350, rarity: 'rare' }
  },
  {
    id: 'item_poison_dagger',
    category: KnowledgeCategory.INVENTORY,
    text: 'Poison Dagger: Quick striking weapon that deals 15 damage and applies poison (5 damage per second for 10 seconds). Price: 180 gold.',
    metadata: { itemId: 'poison_dagger', price: 180, rarity: 'uncommon' }
  },
  {
    id: 'item_mana_crystal',
    category: KnowledgeCategory.INVENTORY,
    text: 'Mana Crystal: Blue glowing gem that restores 100 MP instantly. Essential for spellcasters. Price: 40 gold.',
    metadata: { itemId: 'mana_crystal', price: 40, rarity: 'common' }
  },

  // ═══════════════════════════════════════════════════════════════════
  // LORE - NPC Backstory and Personality
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'lore_backstory',
    category: KnowledgeCategory.LORE,
    text: 'My name is Grimlock. I am a goblin merchant who has traveled across three continents. I once traded with dragons in the Northern Peaks and survived the Merchant Wars of the Eastern Kingdoms. I have seen things that would make adventurers weep.',
  },
  {
    id: 'lore_personality',
    category: KnowledgeCategory.LORE,
    text: 'Grimlock speaks with enthusiasm about merchandise and gets excited about rare items. He is shrewd but fair, never cheating customers but always trying to upsell. He respects brave adventurers and offers discounts to those who share interesting stories.',
  },
  {
    id: 'lore_secrets',
    category: KnowledgeCategory.LORE,
    text: 'Grimlock knows a secret: there is a hidden dungeon beneath the tavern that contains ancient treasures. He only tells this to customers who spend more than 500 gold total. He also knows the location of the Dragon Merchant Guild.',
  },

  // ═══════════════════════════════════════════════════════════════════
  // ENVIRONMENT - Location and Ambiance
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'env_location',
    category: KnowledgeCategory.ENVIRONMENT,
    text: 'This is The Rusty Goblet, a famous tavern and trading post located at the crossroads of three kingdoms. Adventurers from all lands pass through here. The tavern is known for fair deals and rare goods.',
  },
  {
    id: 'env_ambiance',
    category: KnowledgeCategory.ENVIRONMENT,
    text: 'The tavern is dimly lit with warm torchlight. The smell of ale and roasted meat fills the air. Mercenaries discuss quests at nearby tables. A bard plays soft music in the corner.',
  },

  // ═══════════════════════════════════════════════════════════════════
  // BEHAVIOR - Greetings and Reactions
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'behavior_greeting_first',
    category: KnowledgeCategory.BEHAVIOR,
    text: 'When meeting a new customer for the first time, Grimlock says enthusiastically: "Welcome, welcome! Fresh face in my shop! I am Grimlock, purveyor of fine goods and rare artifacts. What brings you to The Rusty Goblet today?"',
  },
  {
    id: 'behavior_greeting_return',
    category: KnowledgeCategory.BEHAVIOR,
    text: 'When a returning customer approaches, Grimlock recognizes them: "Ah, you return! Good to see a familiar face. I have some new items since your last visit. Interested in seeing what treasures I have acquired?"',
  },
  {
    id: 'behavior_no_gold',
    category: KnowledgeCategory.BEHAVIOR,
    text: 'When a customer cannot afford an item, Grimlock says sympathetically: "Ah, short on gold? It happens to the best adventurers. Perhaps start with something more modest, or come back after your next quest!"',
  },
  {
    id: 'behavior_haggle',
    category: KnowledgeCategory.BEHAVIOR,
    text: 'When a customer tries to haggle, Grimlock responds: "Haggling, eh? I respect that! Tell you what - buy two items and I will take 10% off the total. That is as fair as Grimlock gets!"',
  },
  {
    id: 'behavior_rare_item',
    category: KnowledgeCategory.BEHAVIOR,
    text: 'When showing rare items, Grimlock lowers his voice: "Ah, you have good taste. This item... it is special. Not many know I have this. For a discerning customer like yourself, I might be willing to part with it."',
  },

  // ═══════════════════════════════════════════════════════════════════
  // WORLD - Game World Information
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'world_dangers',
    category: KnowledgeCategory.WORLD,
    text: 'The roads outside are dangerous. Bandits roam the Western Pass, and wolf packs hunt in the Northern Forest. Many adventurers buy supplies before heading out. A good shield can save your life.',
  },
  {
    id: 'world_quests',
    category: KnowledgeCategory.WORLD,
    text: 'I hear the Mayor is looking for brave souls to clear the goblin caves to the east. The reward is 200 gold. You might want to stock up on health potions before attempting that quest.',
  },
];
```

### 4.3 Dynamic Context Building

The RAG system should build context dynamically based on:

1. **User's question** - Primary retrieval
2. **Conversation history** - What was discussed before
3. **Game state** - Player's gold, inventory, location
4. **Time** - How long the conversation has been going

```typescript
interface GameContext {
  playerGold: number;
  playerHP: number;
  playerMaxHP: number;
  playerInventory: string[];
  currentLocation: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  isFirstMeeting: boolean;
  totalPurchases: number;
}

function buildAugmentedPrompt(
  npcPersonality: string,
  ragContext: string[],
  gameContext: GameContext,
  userMessage: string
): string {
  return `${npcPersonality}

[CURRENT SITUATION]
- Customer has ${gameContext.playerGold} gold
- Customer HP: ${gameContext.playerHP}/${gameContext.playerMaxHP}
- Location: ${gameContext.currentLocation}
- Time: ${gameContext.timeOfDay}
- First meeting: ${gameContext.isFirstMeeting ? 'Yes' : 'No'}

[RELEVANT KNOWLEDGE]
${ragContext.map((doc, i) => `${i + 1}. ${doc}`).join('\n')}

[INSTRUCTIONS]
Respond as the NPC based on the knowledge above. Stay in character.
If asked about items, only mention items from your knowledge.
If customer lacks gold, suggest alternatives or encourage them.

Customer says: "${userMessage}"`;
}
```

---

## 5. Implementation Guide

### 5.1 Project Structure

```
src/
├── app/
│   ├── core/
│   │   └── services/
│   │       ├── ai/
│   │       │   ├── llm.service.ts          # WebLLM wrapper (exists)
│   │       │   ├── embeddings.service.ts   # Transformers.js wrapper (exists)
│   │       │   └── webgpu.service.ts       # WebGPU detection (exists)
│   │       └── npc/
│   │           ├── npc-knowledge.service.ts   # RAG engine
│   │           ├── npc-vendor.service.ts      # Vendor NPC logic
│   │           └── inventory.service.ts       # Item management
│   └── features/
│       └── npc-vendor-3d/
│           ├── npc-vendor-3d.component.ts     # Main component
│           ├── npc-vendor-3d.component.html   # Template
│           └── npc-vendor-3d.component.css    # Styles
└── docs/
    └── RAG-NPC-SYSTEM.md                      # This document
```

### 5.2 Implementation Order

1. **npc-knowledge.service.ts** - RAG engine using EmbeddingsService
2. **inventory.service.ts** - Item definitions and player inventory
3. **npc-vendor.service.ts** - Combines RAG + LLM for vendor behavior
4. **npc-vendor-3d.component.ts** - 3D scene with Three.js + chat UI

---

## 6. Service Specifications

### 6.1 NpcKnowledgeService Specification

```typescript
// npc-knowledge.service.ts

/**
 * RAG (Retrieval-Augmented Generation) service for NPC knowledge.
 *
 * RESPONSIBILITIES:
 * - Store and index knowledge documents
 * - Perform semantic search using embeddings
 * - Return relevant context for LLM prompts
 *
 * DEPENDENCIES:
 * - EmbeddingsService: For generating and comparing embeddings
 *
 * USAGE:
 * 1. Initialize with knowledge base
 * 2. Query with user message
 * 3. Receive relevant documents
 */
@Injectable({ providedIn: 'root' })
export class NpcKnowledgeService {
  // Index knowledge for an NPC
  async indexKnowledge(npcId: string, documents: KnowledgeDocument[]): Promise<void>;

  // Search knowledge base
  async search(npcId: string, query: string, options?: SearchOptions): Promise<KnowledgeDocument[]>;

  // Clear knowledge for an NPC
  clearKnowledge(npcId: string): void;
}

interface SearchOptions {
  topK?: number;           // Number of results (default: 5)
  minScore?: number;       // Minimum similarity score (default: 0.3)
  categories?: KnowledgeCategory[];  // Filter by category
}
```

### 6.2 InventoryService Specification

```typescript
// inventory.service.ts

/**
 * Manages game items and player inventory.
 *
 * RESPONSIBILITIES:
 * - Define available items with stats
 * - Track player inventory and gold
 * - Handle buy/sell transactions
 */
@Injectable({ providedIn: 'root' })
export class InventoryService {
  // Signals for reactive state
  readonly playerGold: WritableSignal<number>;
  readonly playerInventory: WritableSignal<GameItem[]>;
  readonly playerHP: WritableSignal<number>;
  readonly playerMaxHP: WritableSignal<number>;

  // Get all items available in the game
  getAllItems(): GameItem[];

  // Purchase an item
  buyItem(itemId: string): { success: boolean; message: string };

  // Use a consumable item
  useItem(itemId: string): { success: boolean; effect: string };
}

interface GameItem {
  id: string;
  name: string;
  description: string;
  price: number;
  type: 'consumable' | 'equipment' | 'weapon';
  effect?: ItemEffect;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
}

interface ItemEffect {
  stat: 'hp' | 'maxHp' | 'damage' | 'defense';
  value: number;
  duration?: number;  // In seconds, for temporary effects
}
```

### 6.3 NpcVendorService Specification

```typescript
// npc-vendor.service.ts

/**
 * High-level service that orchestrates NPC vendor behavior.
 *
 * RESPONSIBILITIES:
 * - Initialize NPC with personality and knowledge
 * - Process player messages with RAG enhancement
 * - Generate contextual responses
 * - Track conversation state
 *
 * DEPENDENCIES:
 * - LlmService: For generating responses
 * - NpcKnowledgeService: For RAG retrieval
 * - InventoryService: For game state context
 */
@Injectable({ providedIn: 'root' })
export class NpcVendorService {
  // Initialize the vendor NPC
  async initialize(): Promise<void>;

  // Send message and get response
  async chat(message: string): Promise<string>;

  // Get conversation history
  getHistory(): ChatMessage[];

  // Reset conversation
  resetConversation(): void;

  // Signals
  readonly isReady: Signal<boolean>;
  readonly isThinking: Signal<boolean>;
}
```

---

## 7. 3D Integration with Three.js

### 7.1 Scene Setup

```typescript
import * as THREE from 'three';

class GameScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;

  // Game objects
  private player: THREE.Mesh;
  private npcVendor: THREE.Mesh;
  private room: THREE.Group;

  constructor(container: HTMLElement) {
    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 5, 10);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.createRoom();
    this.createPlayer();
    this.createNPC();
    this.createLighting();
  }

  private createRoom(): void {
    this.room = new THREE.Group();

    // Floor
    const floorGeometry = new THREE.PlaneGeometry(20, 20);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a4a4a,
      roughness: 0.8
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.room.add(floor);

    // Walls
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d2d44,
      roughness: 0.9
    });

    // Back wall
    const backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 8),
      wallMaterial
    );
    backWall.position.set(0, 4, -10);
    this.room.add(backWall);

    // Side walls
    const leftWall = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 8),
      wallMaterial
    );
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-10, 4, 0);
    this.room.add(leftWall);

    const rightWall = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 8),
      wallMaterial
    );
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(10, 4, 0);
    this.room.add(rightWall);

    this.scene.add(this.room);
  }

  private createPlayer(): void {
    // Capsule-like shape for player
    const geometry = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
    const material = new THREE.MeshStandardMaterial({
      color: 0x00ff88,
      emissive: 0x004422
    });
    this.player = new THREE.Mesh(geometry, material);
    this.player.position.set(0, 1, 5);
    this.player.castShadow = true;
    this.scene.add(this.player);
  }

  private createNPC(): void {
    // Cube NPC (the vendor)
    const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    const material = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      emissive: 0x331100
    });
    this.npcVendor = new THREE.Mesh(geometry, material);
    this.npcVendor.position.set(0, 0.75, -3);
    this.npcVendor.castShadow = true;

    // Add floating animation
    this.npcVendor.userData.baseY = 0.75;

    this.scene.add(this.npcVendor);
  }

  private createLighting(): void {
    // Ambient light
    const ambient = new THREE.AmbientLight(0x404040, 0.5);
    this.scene.add(ambient);

    // Main light (torch-like)
    const mainLight = new THREE.PointLight(0xffaa44, 1, 20);
    mainLight.position.set(0, 6, 0);
    mainLight.castShadow = true;
    this.scene.add(mainLight);

    // NPC highlight
    const npcLight = new THREE.PointLight(0xff6600, 0.5, 5);
    npcLight.position.set(0, 3, -3);
    this.scene.add(npcLight);
  }

  // Check if player is close enough to interact
  isPlayerNearNPC(interactionDistance: number = 3): boolean {
    const distance = this.player.position.distanceTo(this.npcVendor.position);
    return distance <= interactionDistance;
  }

  // Move player
  movePlayer(direction: THREE.Vector3): void {
    const speed = 0.15;
    this.player.position.add(direction.multiplyScalar(speed));

    // Clamp to room bounds
    this.player.position.x = Math.max(-9, Math.min(9, this.player.position.x));
    this.player.position.z = Math.max(-9, Math.min(9, this.player.position.z));
  }

  // Animation loop
  animate(): void {
    requestAnimationFrame(() => this.animate());

    // NPC floating animation
    const time = Date.now() * 0.001;
    this.npcVendor.position.y = this.npcVendor.userData.baseY + Math.sin(time * 2) * 0.1;
    this.npcVendor.rotation.y += 0.01;

    this.renderer.render(this.scene, this.camera);
  }
}
```

### 7.2 Input Handling

```typescript
class InputHandler {
  private keys: Set<string> = new Set();
  private onInteract: () => void;

  constructor(onInteract: () => void) {
    this.onInteract = onInteract;

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);

      // E key for interaction
      if (e.code === 'KeyE') {
        this.onInteract();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
  }

  getMovementDirection(): THREE.Vector3 {
    const direction = new THREE.Vector3();

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) {
      direction.z -= 1;
    }
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) {
      direction.z += 1;
    }
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) {
      direction.x -= 1;
    }
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) {
      direction.x += 1;
    }

    return direction.normalize();
  }
}
```

---

## 8. Complete Code Examples

### 8.1 Full NpcKnowledgeService Implementation

```typescript
// src/app/core/services/npc/npc-knowledge.service.ts

import { Injectable, inject } from '@angular/core';
import { EmbeddingsService } from '../ai/embeddings.service';

export enum KnowledgeCategory {
  INVENTORY = 'inventory',
  LORE = 'lore',
  ENVIRONMENT = 'environment',
  BEHAVIOR = 'behavior',
  WORLD = 'world',
}

export interface KnowledgeDocument {
  id: string;
  text: string;
  category: KnowledgeCategory;
  metadata?: Record<string, unknown>;
}

interface IndexedKnowledge {
  documents: KnowledgeDocument[];
  embeddings: number[][];
}

@Injectable({ providedIn: 'root' })
export class NpcKnowledgeService {
  private readonly embeddings = inject(EmbeddingsService);
  private knowledgeBases: Map<string, IndexedKnowledge> = new Map();

  /**
   * Index knowledge documents for an NPC.
   * This creates embeddings for all documents for semantic search.
   */
  async indexKnowledge(npcId: string, documents: KnowledgeDocument[]): Promise<void> {
    // Ensure embeddings model is initialized
    if (!this.embeddings.isReady()) {
      await this.embeddings.initialize();
    }

    // Generate embeddings for all documents
    const texts = documents.map(doc => doc.text);
    const vectors = await this.embeddings.embed(texts);

    // Store indexed knowledge
    this.knowledgeBases.set(npcId, {
      documents,
      embeddings: vectors,
    });

    console.log(`Indexed ${documents.length} documents for NPC: ${npcId}`);
  }

  /**
   * Search knowledge base using semantic similarity.
   */
  async search(
    npcId: string,
    query: string,
    options: {
      topK?: number;
      minScore?: number;
      categories?: KnowledgeCategory[];
    } = {}
  ): Promise<KnowledgeDocument[]> {
    const { topK = 5, minScore = 0.3, categories } = options;

    const knowledge = this.knowledgeBases.get(npcId);
    if (!knowledge) {
      console.warn(`No knowledge base found for NPC: ${npcId}`);
      return [];
    }

    // Generate query embedding
    const queryEmbedding = (await this.embeddings.embed([query]))[0];

    // Calculate similarity scores
    const scored = knowledge.documents.map((doc, index) => ({
      document: doc,
      score: this.cosineSimilarity(queryEmbedding, knowledge.embeddings[index]),
    }));

    // Filter and sort
    return scored
      .filter(item => item.score >= minScore)
      .filter(item => !categories || categories.includes(item.document.category))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(item => item.document);
  }

  /**
   * Clear knowledge for an NPC.
   */
  clearKnowledge(npcId: string): void {
    this.knowledgeBases.delete(npcId);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
    }
    return dot;
  }
}
```

### 8.2 Full NpcVendorService Implementation

```typescript
// src/app/core/services/npc/npc-vendor.service.ts

import { Injectable, inject, signal } from '@angular/core';
import { LlmService, NpcConfig } from '../ai/llm.service';
import { NpcKnowledgeService, KnowledgeDocument, KnowledgeCategory } from './npc-knowledge.service';
import { InventoryService } from './inventory.service';

const NPC_ID = 'vendor_grimlock';

const VENDOR_PERSONALITY = `You are Grimlock, a goblin merchant in The Rusty Goblet tavern.

PERSONALITY:
- Enthusiastic about selling items
- Speaks with merchant flair ("Ah!", "Excellent choice!", "You have good taste!")
- Shrewd but fair - never cheats customers
- Respects brave adventurers
- Knows secrets about the world

RULES:
- Stay in character at all times
- Only mention items from your inventory
- Keep responses to 2-4 sentences
- If customer lacks gold, be sympathetic and suggest alternatives
- Never mention being an AI`;

@Injectable({ providedIn: 'root' })
export class NpcVendorService {
  private readonly llm = inject(LlmService);
  private readonly knowledge = inject(NpcKnowledgeService);
  private readonly inventory = inject(InventoryService);

  readonly isReady = signal(false);
  readonly isThinking = signal(false);
  readonly isInitializing = signal(false);
  readonly initProgress = signal(0);
  readonly initStatus = signal('');

  private isFirstMeeting = true;
  private conversationCount = 0;

  /**
   * Initialize the vendor NPC with knowledge base and LLM.
   */
  async initialize(): Promise<void> {
    this.isInitializing.set(true);
    this.initStatus.set('Indexing knowledge base...');

    try {
      // Step 1: Index knowledge base
      await this.knowledge.indexKnowledge(NPC_ID, VENDOR_KNOWLEDGE);
      this.initProgress.set(30);

      // Step 2: Initialize LLM
      this.initStatus.set('Loading AI model...');

      const config: NpcConfig = {
        modelId: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
        systemPrompt: VENDOR_PERSONALITY,
        temperature: 0.8,
        maxTokens: 300,
      };

      await this.llm.initialize(config);

      this.initProgress.set(100);
      this.initStatus.set('Ready!');
      this.isReady.set(true);
    } finally {
      this.isInitializing.set(false);
    }
  }

  /**
   * Send a message to the vendor and get a response.
   */
  async chat(message: string): Promise<string> {
    if (!this.isReady()) {
      throw new Error('Vendor not initialized');
    }

    this.isThinking.set(true);
    this.conversationCount++;

    try {
      // Step 1: Retrieve relevant knowledge
      const relevantDocs = await this.knowledge.search(NPC_ID, message, {
        topK: 4,
        minScore: 0.25,
      });

      // Step 2: Build context
      const context = this.buildContext(relevantDocs, message);

      // Step 3: Get LLM response
      const response = await this.llm.chat(context);

      this.isFirstMeeting = false;
      return response;
    } finally {
      this.isThinking.set(false);
    }
  }

  /**
   * Get a greeting based on whether this is a first meeting.
   */
  async getGreeting(): Promise<string> {
    const prompt = this.isFirstMeeting
      ? "A new customer just approached your shop for the first time. Greet them warmly and introduce yourself."
      : "A returning customer has come back to your shop. Welcome them back.";

    return this.chat(prompt);
  }

  private buildContext(docs: KnowledgeDocument[], userMessage: string): string {
    const gameState = {
      gold: this.inventory.playerGold(),
      hp: this.inventory.playerHP(),
      maxHp: this.inventory.playerMaxHP(),
    };

    let context = `[CUSTOMER STATUS]
- Gold: ${gameState.gold}
- Health: ${gameState.hp}/${gameState.maxHp}
- Meeting: ${this.isFirstMeeting ? 'First time' : 'Returning customer'}

[YOUR KNOWLEDGE]
`;

    docs.forEach((doc, i) => {
      context += `${i + 1}. ${doc.text}\n`;
    });

    context += `\n[CUSTOMER SAYS]: "${userMessage}"`;

    return context;
  }

  resetConversation(): void {
    this.llm.resetConversation();
    this.isFirstMeeting = true;
    this.conversationCount = 0;
  }
}

// Knowledge base defined inline for simplicity
const VENDOR_KNOWLEDGE: KnowledgeDocument[] = [
  // Items
  {
    id: 'item_health_potion',
    category: KnowledgeCategory.INVENTORY,
    text: 'Health Potion: Red bubbling liquid that restores 50 HP instantly. Price: 25 gold. Common item, always in stock.',
    metadata: { itemId: 'health_potion', price: 25 }
  },
  {
    id: 'item_mega_health',
    category: KnowledgeCategory.INVENTORY,
    text: 'Mega Health Elixir: Legendary golden potion that fully restores HP and grants 10% max HP bonus for 5 minutes. Price: 500 gold. Very rare.',
    metadata: { itemId: 'mega_health', price: 500 }
  },
  {
    id: 'item_shield_charm',
    category: KnowledgeCategory.INVENTORY,
    text: 'Shield Charm: Enchanted amulet reducing incoming damage by 25% for 60 seconds. Price: 75 gold.',
    metadata: { itemId: 'shield_charm', price: 75 }
  },
  {
    id: 'item_iron_shield',
    category: KnowledgeCategory.INVENTORY,
    text: 'Iron Shield: Sturdy equipment blocking 40% physical damage permanently. Price: 200 gold.',
    metadata: { itemId: 'iron_shield', price: 200 }
  },
  {
    id: 'item_fire_blade',
    category: KnowledgeCategory.INVENTORY,
    text: 'Fire Blade: Sword with eternal flames. 30 base damage + 15 fire damage. Enemies may catch fire. Price: 350 gold. Rare.',
    metadata: { itemId: 'fire_blade', price: 350 }
  },
  {
    id: 'item_poison_dagger',
    category: KnowledgeCategory.INVENTORY,
    text: 'Poison Dagger: Quick weapon dealing 15 damage + poison (5 DPS for 10 seconds). Price: 180 gold.',
    metadata: { itemId: 'poison_dagger', price: 180 }
  },
  {
    id: 'item_mana_crystal',
    category: KnowledgeCategory.INVENTORY,
    text: 'Mana Crystal: Blue gem restoring 100 MP instantly. Essential for spellcasters. Price: 40 gold.',
    metadata: { itemId: 'mana_crystal', price: 40 }
  },
  // Lore
  {
    id: 'lore_backstory',
    category: KnowledgeCategory.LORE,
    text: 'Grimlock is a goblin merchant who traveled three continents, traded with dragons in the Northern Peaks, and survived the Merchant Wars.',
  },
  {
    id: 'lore_personality',
    category: KnowledgeCategory.LORE,
    text: 'Grimlock speaks enthusiastically about merchandise, is shrewd but fair, respects brave adventurers, and offers discounts for interesting stories.',
  },
  // Environment
  {
    id: 'env_location',
    category: KnowledgeCategory.ENVIRONMENT,
    text: 'The Rusty Goblet is a famous tavern at the crossroads of three kingdoms. Known for fair deals and rare goods.',
  },
  {
    id: 'env_ambiance',
    category: KnowledgeCategory.ENVIRONMENT,
    text: 'Dimly lit with warm torchlight. Smells of ale and roasted meat. Mercenaries discuss quests nearby. A bard plays soft music.',
  },
  // Behaviors
  {
    id: 'behavior_greeting',
    category: KnowledgeCategory.BEHAVIOR,
    text: 'First meeting: "Welcome! Fresh face in my shop! I am Grimlock, purveyor of fine goods. What brings you to The Rusty Goblet?"',
  },
  {
    id: 'behavior_no_gold',
    category: KnowledgeCategory.BEHAVIOR,
    text: 'When customer cannot afford: "Short on gold? Happens to the best! Perhaps something modest, or return after your next quest!"',
  },
  {
    id: 'behavior_haggle',
    category: KnowledgeCategory.BEHAVIOR,
    text: 'Haggling response: "Buy two items and I take 10% off the total. Fair as Grimlock gets!"',
  },
  // World
  {
    id: 'world_dangers',
    category: KnowledgeCategory.WORLD,
    text: 'Roads are dangerous: bandits in Western Pass, wolves in Northern Forest. A good shield saves lives.',
  },
  {
    id: 'world_quests',
    category: KnowledgeCategory.WORLD,
    text: 'The Mayor seeks brave souls to clear goblin caves east of here. Reward: 200 gold. Stock up on health potions first.',
  },
];
```

---

## 9. Performance Optimization

### 9.1 Model Caching Strategy

```typescript
// Models are cached automatically by WebLLM and Transformers.js
// First load: Downloads from CDN (~300MB-2GB)
// Subsequent loads: Loads from browser cache (~2-10 seconds)

// Check if model is cached
async function isModelCached(modelId: string): Promise<boolean> {
  const cache = await caches.open('webllm-models');
  const keys = await cache.keys();
  return keys.some(key => key.url.includes(modelId));
}
```

### 9.2 Embedding Batch Processing

```typescript
// Instead of embedding one document at a time, batch them
const BATCH_SIZE = 50;

async function indexLargeKnowledgeBase(docs: KnowledgeDocument[]): Promise<void> {
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);
    const embeddings = await embeddingsService.embed(batch.map(d => d.text));
    // Store embeddings...
  }
}
```

### 9.3 Response Streaming

```typescript
// Use streaming for better UX - shows response as it's generated
async function* streamResponse(message: string): AsyncGenerator<string> {
  const chunks = await llm.chat.completions.create({
    messages: [...],
    stream: true
  });

  for await (const chunk of chunks) {
    yield chunk.choices[0]?.delta?.content || '';
  }
}

// Usage in component
for await (const chunk of npcService.streamChat(message)) {
  displayedText += chunk;
  updateUI();
}
```

---

## 10. Extending the System

### 10.1 Creating New NPC Types

```typescript
// Template for new NPC types
interface NpcDefinition {
  id: string;
  name: string;
  personality: string;
  knowledge: KnowledgeDocument[];
  modelConfig: NpcConfig;
}

const HEALER_NPC: NpcDefinition = {
  id: 'healer_elara',
  name: 'Elara the Healer',
  personality: `You are Elara, a kind elven healer...`,
  knowledge: [
    { id: 'heal_1', category: KnowledgeCategory.INVENTORY, text: 'Healing services...' },
    // ... more knowledge
  ],
  modelConfig: {
    modelId: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    systemPrompt: '', // Set from personality
    temperature: 0.6,  // Lower for more consistent healing advice
    maxTokens: 200,
  }
};
```

### 10.2 Adding New Knowledge Categories

```typescript
// Extend the enum
export enum KnowledgeCategory {
  INVENTORY = 'inventory',
  LORE = 'lore',
  ENVIRONMENT = 'environment',
  BEHAVIOR = 'behavior',
  WORLD = 'world',
  // New categories
  QUEST = 'quest',        // Quest information
  RECIPE = 'recipe',      // Crafting recipes
  COMBAT = 'combat',      // Combat tips
}
```

### 10.3 Multi-NPC Conversations

```typescript
// Support multiple NPCs with their own contexts
class NpcManager {
  private npcs: Map<string, NpcVendorService> = new Map();

  async initializeNpc(definition: NpcDefinition): Promise<void> {
    const service = new NpcVendorService();
    await service.initialize(definition);
    this.npcs.set(definition.id, service);
  }

  async chat(npcId: string, message: string): Promise<string> {
    const npc = this.npcs.get(npcId);
    if (!npc) throw new Error(`NPC ${npcId} not found`);
    return npc.chat(message);
  }
}
```

---

## Summary

This document provides everything needed to implement an intelligent NPC system:

1. **WebGPU** provides GPU acceleration for AI inference
2. **WebLLM** runs LLMs entirely in the browser
3. **Transformers.js** generates embeddings for semantic search
4. **RAG** retrieves relevant knowledge to augment LLM prompts
5. **Three.js** creates the 3D environment for interaction
6. **Angular services** orchestrate all components

The system is designed to be:
- **Extensible**: Easy to add new NPCs and knowledge
- **Performant**: Uses GPU acceleration and caching
- **Offline-capable**: All AI runs locally after initial download
- **Immersive**: NPCs have personality, context awareness, and memory

---

*Document Version: 1.0*
*Last Updated: 2024*
*Author: Claude Code Assistant*
