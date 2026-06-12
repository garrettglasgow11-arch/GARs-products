// ============================================================
//  Garrett's Obsidian Gear - main.js
//  Made by Garrett6826
// ============================================================
import { world, system, EquipmentSlot } from "@minecraft/server";

// Items in this list can NEVER be destroyed by TNT / explosions
// when dropped on the ground. Add future obsidian gear here!
const EXPLOSION_PROOF_ITEMS = [
    "garrett:obsidian_sword"
];

// ------------------------------------------------------------
// 1) Join message
// ------------------------------------------------------------
world.afterEvents.playerSpawn.subscribe((event) => {
    if (!event.initialSpawn) return;
    const player = event.player;
    player.sendMessage("§8[§5Obsidian Gear§8] §7Made by §dGarrett6826");
});

// ------------------------------------------------------------
// 2) Explosion protection for dropped obsidian gear
//    Right before any explosion goes off, we take a snapshot of
//    every protected item lying on the ground in that dimension.
//    One tick later, any of them that got blown up are respawned
//    exactly where they were - so TNT can never destroy them.
// ------------------------------------------------------------
world.beforeEvents.explosion.subscribe((event) => {
    const dimension = event.dimension;
    const snapshots = [];

    for (const entity of dimension.getEntities({ type: "minecraft:item" })) {
        try {
            const stack = entity.getComponent("minecraft:item")?.itemStack;
            if (stack && EXPLOSION_PROOF_ITEMS.includes(stack.typeId)) {
                snapshots.push({
                    entity: entity,
                    stack: stack.clone(),
                    location: { x: entity.location.x, y: entity.location.y, z: entity.location.z }
                });
            }
        } catch {
            // entity may be unloaded mid-iteration; skip it
        }
    }

    if (snapshots.length === 0) return;

    // Runs on the next tick, after the explosion has resolved
    system.run(() => {
        for (const snap of snapshots) {
            if (!snap.entity.isValid) {
                try {
                    dimension.spawnItem(snap.stack, snap.location);
                } catch {
                    // location may be in an unloaded chunk; nothing we can do
                }
            }
        }
    });
});

// ------------------------------------------------------------
// 3) Crying obsidian ambient particles while sword is held
//    Occasionally spawns glowing obsidian particles near the
//    player's hand — subtle, like the crying obsidian drip.
//    Fires every second with a ~40% chance, so roughly one
//    particle burst every 2-3 seconds per player.
// ------------------------------------------------------------
system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        try {
            const equip = player.getComponent("minecraft:equippable");
            const held = equip?.getEquipment(EquipmentSlot.Mainhand);
            if (!held || held.typeId !== "garrett:obsidian_sword") continue;
            if (Math.random() > 0.4) continue;

            const loc = player.location;
            const dim = player.dimension;
            const spread = 0.25;

            // Single particle near the sword hand — pixel-scale scatter
            dim.spawnParticle("minecraft:obsidian_glow_particle", {
                x: loc.x + (Math.random() - 0.5) * spread,
                y: loc.y + 1.1 + (Math.random() - 0.5) * spread,
                z: loc.z + (Math.random() - 0.5) * spread
            });
        } catch {
            // player or dimension may be temporarily unavailable; skip
        }
    }
}, 20); // 20 ticks = 1 second interval
