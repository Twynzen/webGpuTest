import { Injectable, signal, computed } from '@angular/core';

/**
 * Types of game items.
 */
export type ItemType = 'consumable' | 'equipment' | 'weapon';

/**
 * Item rarity levels.
 */
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

/**
 * Effect that an item can have when used.
 */
export interface ItemEffect {
  stat: 'hp' | 'maxHp' | 'damage' | 'defense' | 'mp';
  value: number;
  duration?: number; // In seconds, for temporary effects
  isPercentage?: boolean;
}

/**
 * A game item definition.
 */
export interface GameItem {
  id: string;
  name: string;
  description: string;
  price: number;
  type: ItemType;
  rarity: ItemRarity;
  effect?: ItemEffect;
  stackable?: boolean;
  maxStack?: number;
}

/**
 * An item in the player's inventory.
 */
export interface InventoryItem {
  item: GameItem;
  quantity: number;
}

/**
 * Result of a transaction or item use.
 */
export interface TransactionResult {
  success: boolean;
  message: string;
  item?: GameItem;
}

/**
 * All available items in the game.
 */
export const GAME_ITEMS: GameItem[] = [
  // ═══════════════════════════════════════════════════════════════════
  // CONSUMABLES - Health & Mana
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'health_potion',
    name: 'Health Potion',
    description: 'A red bubbling liquid that restores 50 HP instantly.',
    price: 25,
    type: 'consumable',
    rarity: 'common',
    effect: { stat: 'hp', value: 50 },
    stackable: true,
    maxStack: 99,
  },
  {
    id: 'mega_health',
    name: 'Mega Health Elixir',
    description:
      'Legendary golden potion that fully restores HP and grants 10% max HP bonus for 5 minutes.',
    price: 500,
    type: 'consumable',
    rarity: 'legendary',
    effect: { stat: 'hp', value: 100, isPercentage: true },
    stackable: true,
    maxStack: 10,
  },
  {
    id: 'mana_crystal',
    name: 'Mana Crystal',
    description: 'Blue glowing gem that restores 100 MP instantly.',
    price: 40,
    type: 'consumable',
    rarity: 'common',
    effect: { stat: 'mp', value: 100 },
    stackable: true,
    maxStack: 99,
  },
  {
    id: 'healing_herb',
    name: 'Healing Herb',
    description: 'Natural remedy that restores 20 HP over 10 seconds.',
    price: 10,
    type: 'consumable',
    rarity: 'common',
    effect: { stat: 'hp', value: 20, duration: 10 },
    stackable: true,
    maxStack: 99,
  },

  // ═══════════════════════════════════════════════════════════════════
  // CONSUMABLES - Buffs
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'shield_charm',
    name: 'Shield Charm',
    description:
      'Enchanted amulet that reduces incoming damage by 25% for 60 seconds.',
    price: 75,
    type: 'consumable',
    rarity: 'uncommon',
    effect: { stat: 'defense', value: 25, duration: 60, isPercentage: true },
    stackable: true,
    maxStack: 20,
  },
  {
    id: 'strength_potion',
    name: 'Strength Potion',
    description: 'Increases damage dealt by 20% for 60 seconds.',
    price: 80,
    type: 'consumable',
    rarity: 'uncommon',
    effect: { stat: 'damage', value: 20, duration: 60, isPercentage: true },
    stackable: true,
    maxStack: 20,
  },

  // ═══════════════════════════════════════════════════════════════════
  // EQUIPMENT - Defense
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'iron_shield',
    name: 'Iron Shield',
    description:
      'Sturdy defensive equipment that blocks 40% of physical damage.',
    price: 200,
    type: 'equipment',
    rarity: 'uncommon',
    effect: { stat: 'defense', value: 40, isPercentage: true },
  },
  {
    id: 'dragon_shield',
    name: 'Dragon Shield',
    description:
      'Legendary shield forged from dragon scales. Blocks 60% damage and grants fire resistance.',
    price: 1000,
    type: 'equipment',
    rarity: 'legendary',
    effect: { stat: 'defense', value: 60, isPercentage: true },
  },

  // ═══════════════════════════════════════════════════════════════════
  // WEAPONS
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'iron_sword',
    name: 'Iron Sword',
    description: 'Reliable sword dealing 25 base damage.',
    price: 100,
    type: 'weapon',
    rarity: 'common',
    effect: { stat: 'damage', value: 25 },
  },
  {
    id: 'fire_blade',
    name: 'Fire Blade',
    description:
      'Sword enchanted with eternal flames. Deals 30 base damage plus 15 fire damage.',
    price: 350,
    type: 'weapon',
    rarity: 'rare',
    effect: { stat: 'damage', value: 45 },
  },
  {
    id: 'poison_dagger',
    name: 'Poison Dagger',
    description:
      'Quick striking weapon that deals 15 damage and applies poison.',
    price: 180,
    type: 'weapon',
    rarity: 'uncommon',
    effect: { stat: 'damage', value: 15 },
  },
  {
    id: 'thunder_hammer',
    name: 'Thunder Hammer',
    description:
      'Massive hammer crackling with lightning. Deals 50 damage with chance to stun.',
    price: 600,
    type: 'weapon',
    rarity: 'rare',
    effect: { stat: 'damage', value: 50 },
  },
  {
    id: 'shadow_blade',
    name: 'Shadow Blade',
    description:
      'Legendary blade that phases through armor. Deals 40 true damage.',
    price: 800,
    type: 'weapon',
    rarity: 'legendary',
    effect: { stat: 'damage', value: 40 },
  },
];

/**
 * Service for managing game items and player inventory.
 *
 * This service handles:
 * - Player stats (HP, MP, Gold)
 * - Inventory management
 * - Buy/sell transactions
 * - Using consumable items
 *
 * USAGE:
 * ```typescript
 * // Check if player can afford an item
 * if (inventoryService.playerGold() >= 25) {
 *   const result = inventoryService.buyItem('health_potion');
 *   console.log(result.message);
 * }
 *
 * // Use an item from inventory
 * const useResult = inventoryService.useItem('health_potion');
 * ```
 */
@Injectable({ providedIn: 'root' })
export class InventoryService {
  // ═══════════════════════════════════════════════════════════════════
  // Player Stats
  // ═══════════════════════════════════════════════════════════════════
  readonly playerGold = signal(100); // Starting gold
  readonly playerHP = signal(80); // Current HP
  readonly playerMaxHP = signal(100); // Maximum HP
  readonly playerMP = signal(50); // Current MP
  readonly playerMaxMP = signal(100); // Maximum MP

  // ═══════════════════════════════════════════════════════════════════
  // Inventory
  // ═══════════════════════════════════════════════════════════════════
  readonly playerInventory = signal<InventoryItem[]>([]);

  // Computed values
  readonly inventoryCount = computed(() =>
    this.playerInventory().reduce((sum, item) => sum + item.quantity, 0)
  );

  readonly hpPercentage = computed(
    () => (this.playerHP() / this.playerMaxHP()) * 100
  );

  readonly mpPercentage = computed(
    () => (this.playerMP() / this.playerMaxMP()) * 100
  );

  /**
   * Get all available items in the game.
   */
  getAllItems(): GameItem[] {
    return [...GAME_ITEMS];
  }

  /**
   * Get an item by its ID.
   */
  getItemById(itemId: string): GameItem | undefined {
    return GAME_ITEMS.find((item) => item.id === itemId);
  }

  /**
   * Get items by type.
   */
  getItemsByType(type: ItemType): GameItem[] {
    return GAME_ITEMS.filter((item) => item.type === type);
  }

  /**
   * Get items by rarity.
   */
  getItemsByRarity(rarity: ItemRarity): GameItem[] {
    return GAME_ITEMS.filter((item) => item.rarity === rarity);
  }

  /**
   * Buy an item from a vendor.
   *
   * @param itemId - The ID of the item to buy
   * @param quantity - How many to buy (default: 1)
   * @returns Transaction result
   */
  buyItem(itemId: string, quantity: number = 1): TransactionResult {
    const item = this.getItemById(itemId);

    if (!item) {
      return { success: false, message: `Item "${itemId}" not found.` };
    }

    const totalCost = item.price * quantity;

    if (this.playerGold() < totalCost) {
      return {
        success: false,
        message: `Not enough gold. Need ${totalCost}g but only have ${this.playerGold()}g.`,
        item,
      };
    }

    // Deduct gold
    this.playerGold.update((g) => g - totalCost);

    // Add to inventory
    this.addToInventory(item, quantity);

    return {
      success: true,
      message: `Purchased ${quantity}x ${item.name} for ${totalCost} gold.`,
      item,
    };
  }

  /**
   * Sell an item from inventory.
   *
   * @param itemId - The ID of the item to sell
   * @param quantity - How many to sell (default: 1)
   * @returns Transaction result
   */
  sellItem(itemId: string, quantity: number = 1): TransactionResult {
    const inventoryItem = this.playerInventory().find(
      (inv) => inv.item.id === itemId
    );

    if (!inventoryItem || inventoryItem.quantity < quantity) {
      return {
        success: false,
        message: `Don't have enough ${itemId} to sell.`,
      };
    }

    // Sell price is 50% of buy price
    const sellPrice = Math.floor(inventoryItem.item.price * 0.5) * quantity;

    // Add gold
    this.playerGold.update((g) => g + sellPrice);

    // Remove from inventory
    this.removeFromInventory(itemId, quantity);

    return {
      success: true,
      message: `Sold ${quantity}x ${inventoryItem.item.name} for ${sellPrice} gold.`,
      item: inventoryItem.item,
    };
  }

  /**
   * Use a consumable item from inventory.
   *
   * @param itemId - The ID of the item to use
   * @returns Transaction result with effect description
   */
  useItem(itemId: string): TransactionResult {
    const inventoryItem = this.playerInventory().find(
      (inv) => inv.item.id === itemId
    );

    if (!inventoryItem || inventoryItem.quantity < 1) {
      return { success: false, message: `Don't have any ${itemId}.` };
    }

    const item = inventoryItem.item;

    if (item.type !== 'consumable') {
      return {
        success: false,
        message: `${item.name} is not consumable.`,
        item,
      };
    }

    // Apply effect
    const effectMessage = this.applyEffect(item);

    // Remove from inventory
    this.removeFromInventory(itemId, 1);

    return {
      success: true,
      message: `Used ${item.name}. ${effectMessage}`,
      item,
    };
  }

  /**
   * Check if player has a specific item.
   */
  hasItem(itemId: string): boolean {
    const inventoryItem = this.playerInventory().find(
      (inv) => inv.item.id === itemId
    );
    return inventoryItem !== undefined && inventoryItem.quantity > 0;
  }

  /**
   * Get quantity of a specific item in inventory.
   */
  getItemQuantity(itemId: string): number {
    const inventoryItem = this.playerInventory().find(
      (inv) => inv.item.id === itemId
    );
    return inventoryItem?.quantity ?? 0;
  }

  /**
   * Add gold to player.
   */
  addGold(amount: number): void {
    this.playerGold.update((g) => g + amount);
  }

  /**
   * Damage the player.
   */
  takeDamage(amount: number): void {
    this.playerHP.update((hp) => Math.max(0, hp - amount));
  }

  /**
   * Heal the player.
   */
  heal(amount: number): void {
    this.playerHP.update((hp) => Math.min(this.playerMaxHP(), hp + amount));
  }

  /**
   * Reset player to default state.
   */
  resetPlayer(): void {
    this.playerGold.set(100);
    this.playerHP.set(80);
    this.playerMaxHP.set(100);
    this.playerMP.set(50);
    this.playerMaxMP.set(100);
    this.playerInventory.set([]);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Private Methods
  // ═══════════════════════════════════════════════════════════════════

  private addToInventory(item: GameItem, quantity: number): void {
    this.playerInventory.update((inventory) => {
      const existing = inventory.find((inv) => inv.item.id === item.id);

      if (existing) {
        // Check stack limit
        const maxStack = item.maxStack ?? 99;
        const newQuantity = Math.min(existing.quantity + quantity, maxStack);
        return inventory.map((inv) =>
          inv.item.id === item.id ? { ...inv, quantity: newQuantity } : inv
        );
      } else {
        // Add new item
        return [...inventory, { item, quantity }];
      }
    });
  }

  private removeFromInventory(itemId: string, quantity: number): void {
    this.playerInventory.update((inventory) => {
      return inventory
        .map((inv) =>
          inv.item.id === itemId
            ? { ...inv, quantity: inv.quantity - quantity }
            : inv
        )
        .filter((inv) => inv.quantity > 0);
    });
  }

  private applyEffect(item: GameItem): string {
    if (!item.effect) {
      return 'No effect.';
    }

    const { stat, value, isPercentage } = item.effect;

    switch (stat) {
      case 'hp': {
        let healAmount = value;
        if (isPercentage) {
          healAmount = Math.floor(this.playerMaxHP() * (value / 100));
        }
        this.heal(healAmount);
        return `Restored ${healAmount} HP.`;
      }
      case 'mp': {
        let manaAmount = value;
        if (isPercentage) {
          manaAmount = Math.floor(this.playerMaxMP() * (value / 100));
        }
        this.playerMP.update((mp) =>
          Math.min(this.playerMaxMP(), mp + manaAmount)
        );
        return `Restored ${manaAmount} MP.`;
      }
      case 'maxHp': {
        this.playerMaxHP.update((max) => max + value);
        return `Max HP increased by ${value}.`;
      }
      default:
        return `Applied ${stat} effect.`;
    }
  }
}
