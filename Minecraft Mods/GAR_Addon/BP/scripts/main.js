// ============================================================
//  Garrett's Obsidian Gear - main.js
//  Made by Garrett6826
// ============================================================
import { world, system, EquipmentSlot, EntityDamageCause, Player } from "@minecraft/server";

// Items that can NEVER be destroyed by explosions when dropped.
const EXPLOSION_PROOF_ITEMS = [
    "garrett:obsidian_sword",
    "garrett:obsidian_helmet",
    "garrett:obsidian_chestplate",
    "garrett:obsidian_leggings",
    "garrett:obsidian_boots",
    "garrett:obsidian_blade",
    "garrett:obsidian_sword_hilt",
    "garrett:obsidian_sword_mount",
];

// Armor pieces that grant blast protection to the wearer.
const OBSIDIAN_ARMOR = [
    "garrett:obsidian_helmet",
    "garrett:obsidian_chestplate",
    "garrett:obsidian_leggings",
    "garrett:obsidian_boots",
];

const ARMOR_SLOTS = [
    EquipmentSlot.Head,
    EquipmentSlot.Chest,
    EquipmentSlot.Legs,
    EquipmentSlot.Feet,
];

// ------------------------------------------------------------
// 1) Join message
// ------------------------------------------------------------
world.afterEvents.playerSpawn.subscribe((event) => {
    if (!event.initialSpawn) return;
    event.player.sendMessage("§8[§5Obsidian Gear§8] §7Made by §dGarrett6826");
});

// ------------------------------------------------------------
// 2) Explosion protection for dropped obsidian gear
//    Snapshots every protected item before each explosion fires,
//    then respawns any that got destroyed. TNT can never delete them.
// ------------------------------------------------------------
world.beforeEvents.explosion.subscribe((event) => {
    const dimension = event.dimension;
    const snapshots = [];

    for (const entity of dimension.getEntities({ type: "minecraft:item" })) {
        try {
            const stack = entity.getComponent("minecraft:item")?.itemStack;
            if (stack && EXPLOSION_PROOF_ITEMS.includes(stack.typeId)) {
                snapshots.push({
                    entity,
                    stack: stack.clone(),
                    location: { ...entity.location },
                });
            }
        } catch { /* entity unloaded mid-iteration */ }
    }

    if (snapshots.length === 0) return;

    system.run(() => {
        for (const snap of snapshots) {
            if (!snap.entity.isValid) {
                try { dimension.spawnItem(snap.stack, snap.location); } catch { /* unloaded chunk */ }
            }
        }
    });
});

// ------------------------------------------------------------
// 3) Blast protection for players wearing obsidian armor
//    Damage reduction scales with pieces worn:
//      1 piece  →  40 % absorbed
//      2 pieces →  65 % absorbed
//      3 pieces →  85 % absorbed
//      4 pieces → 100 % absorbed (full immunity)
//    Works against TNT, creepers, beds, respawn anchors, etc.
// ------------------------------------------------------------
const BLAST_REDUCTION = [0, 0.40, 0.65, 0.85, 1.0];

world.afterEvents.entityHurt.subscribe((event) => {
    const player = event.hurtEntity;
    if (!(player instanceof Player)) return;

    const cause = event.damageSource.cause;
    const isBlast =
        cause === EntityDamageCause.entityExplosion ||
        cause === EntityDamageCause.blockExplosion;
    if (!isBlast) return;

    try {
        const equip = player.getComponent("minecraft:equippable");
        if (!equip) return;

        const pieces = ARMOR_SLOTS.filter(slot => {
            const item = equip.getEquipment(slot);
            return item && OBSIDIAN_ARMOR.includes(item.typeId);
        }).length;

        if (pieces === 0) return;

        const reduction = BLAST_REDUCTION[pieces];
        const healBack  = event.damage * reduction;

        const health = player.getComponent("minecraft:health");
        if (health && healBack > 0) {
            health.setCurrentValue(
                Math.min(health.effectiveMax, health.currentValue + healBack)
            );
        }

        // Full set: also send a dramatic visual cue
        if (pieces === 4) {
            player.sendMessage("§5§lObsidian Armor absorbed the blast!");
        }
    } catch { /* player component temporarily unavailable */ }
});

// ------------------------------------------------------------
// 4) Crying obsidian ambient particles while sword is held
// ------------------------------------------------------------
system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        try {
            const equip = player.getComponent("minecraft:equippable");
            const held  = equip?.getEquipment(EquipmentSlot.Mainhand);
            if (!held || held.typeId !== "garrett:obsidian_sword") continue;
            if (Math.random() > 0.4) continue;

            const loc    = player.location;
            const spread = 0.25;
            player.dimension.spawnParticle("minecraft:obsidian_glow_particle", {
                x: loc.x + (Math.random() - 0.5) * spread,
                y: loc.y + 1.1 + (Math.random() - 0.5) * spread,
                z: loc.z + (Math.random() - 0.5) * spread,
            });
        } catch { /* skip */ }
    }
}, 20);
