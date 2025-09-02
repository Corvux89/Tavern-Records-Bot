/**
 * TavernRecords XP Bot
 * Copyright (c) 2025 Ravenwingz
 *
 * Originally based on code by JTexpo
 * Updated and maintained by Ravenwingz
 *
 * Licensed under the MIT License with Attribution Notice.
 * See the LICENSE and NOTICE files in the project root for details.
 */

const { EmbedBuilder } = require('discord.js');
const { XPHOLDER_ICON_URL, DONATE_URL, DEV_SERVER_URL } = require('../config.json');
const { getLevelInfo, getTier } = require('../utils');

/**
 * Clamp very light/dark role colors to keep embeds readable in Discord dark theme.
 */
function clampEmbedColor(colorInt) {
    const r = (colorInt >> 16) & 0xff;
    const g = (colorInt >> 8) & 0xff;
    const b = colorInt & 0xff;
    const avg = (r + g + b) / 3;

    if (avg > 230) return 0xC0C0C0; // too bright → light gray
    if (avg < 20)  return 0x2F3136; // too dark → discord-ish dark
    return colorInt;
}

/**
 * Pick the emoji whose anchor color is closest to the role's color in RGB space.
 */
function pickEmojiForColor(colorInt) {
    const r = (colorInt >> 16) & 0xff;
    const g = (colorInt >> 8) & 0xff;
    const b = colorInt & 0xff;

    const anchors = {
        '🟦': { r: 59,  g: 130, b: 246 }, // blue
        '🟪': { r: 139, g: 92,  b: 246 }, // purple
        '🟩': { r: 34,  g: 197, b: 94  }, // green
        '🟨': { r: 250, g: 204, b: 21  }, // yellow
        '🟥': { r: 239, g: 68,  b: 68  }  // red
    };

    let bestEmoji = '🟦';
    let bestDist = Number.POSITIVE_INFINITY;

    for (const [emoji, c] of Object.entries(anchors)) {
        const dr = r - c.r;
        const dg = g - c.g;
        const db = b - c.b;
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) {
            bestDist = dist;
            bestEmoji = emoji;
        }
    }
    return bestEmoji;
}

/**
 * Get the tier visuals: matching emoji + role color.
 * Falls back if the role has no color or can't be fetched.
 */
async function getTierVisuals(guild, roleId, fallbackEmoji = '🟦', fallbackColor = 0x7289DA) {
    try {
        const role = await guild.roles.fetch(roleId).catch(() => null);
        if (!role || !role.color || role.color === 0) {
            return { emoji: fallbackEmoji, color: clampEmbedColor(fallbackColor) };
        }
        const emoji = pickEmojiForColor(role.color);
        return { emoji, color: clampEmbedColor(role.color) };
    } catch {
        return { emoji: fallbackEmoji, color: clampEmbedColor(fallbackColor) };
    }
}

/**
 * Build an emoji progress bar + numeric details.
 */
function getEmojiProgressBar(currentXP, neededXP, barLength = 12, emoji = '🟦') {
    if (!neededXP || neededXP <= 0 || isNaN(currentXP) || isNaN(neededXP)) {
        return `${'⬛'.repeat(barLength)} 0%`;
    }
    const percent = Math.min(currentXP / neededXP, 1);
    const filled = Math.round(barLength * percent);
    const empty = barLength - filled;
    return `${emoji.repeat(filled)}${'⬛'.repeat(empty)} ${Math.floor(percent * 100)}%`;
}

/**
 * Build the character embed with tier-colored progress bar and matching embed color.
 */
async function buildCharacterEmbed(guildService, guild, player, character, index) {
    const levelInfo = getLevelInfo(guildService.levels, character.xp);
    const tierInfo = getTier(levelInfo.level);

    const tierRoleId = guildService.config[`tier${tierInfo.tier}RoleId`];
    const { emoji, color } = await getTierVisuals(guild, tierRoleId);

    const currentLevelXp = Math.floor(levelInfo.levelXp ?? 0);
    const xpToNext = Math.floor(levelInfo.xpToNext ?? 1);
    const progressBar = getEmojiProgressBar(currentLevelXp, xpToNext, 12, emoji);

    // Status flags (reads user's roles)
    const roleList = Array.isArray(player?._roles) ? player._roles : [];
    const freezeId = guildService.config["xpFreezeRoleId"];
    const shareId  = guildService.config["xpShareRoleId"];
    const isFrozen = freezeId && roleList.includes(freezeId) ? "On ❄️" : "Off";
    const isShare  = shareId  && roleList.includes(shareId)  ? "On 🎁" : "Off";

    // Per-character ping flag (defaults to On if missing for legacy rows)
    const pingRaw = character?.ping_on_award;
    const isPing  = (pingRaw === 0 ? false : true) ? "On 🔔" : "Off";

    const embed = new EmbedBuilder()
        .setAuthor({
            name: character.name || "Character",
            iconURL: (character.picture_url && character.picture_url !== "null") ? character.picture_url : XPHOLDER_ICON_URL
        })
        .setTitle(`Level ${levelInfo.level} • ${emoji} Tier ${tierInfo.tier}`)
        .addFields(
            { name: "Character Index", value: (character.character_index?.toString() ?? "1"), inline: true },
            { name: "Total XP", value: `${Math.floor(character.xp)}`, inline: true },
            { name: "Tier Role", value: tierRoleId ? `<@&${tierRoleId}>` : "None", inline: true },
        )
        .setThumbnail(
            (character.picture_url && character.picture_url !== "null")
                ? character.picture_url
                : XPHOLDER_ICON_URL
        )
        .setColor(color)
        .setTimestamp();

    // Optional flavor fields
    const flavorFields = [];
    if (character.class)      flavorFields.push({ name: "Class",      value: character.class,                         inline: true });
    if (character.species || character.race)
                             flavorFields.push({ name: "Race",       value: character.species || character.race,     inline: true });
    if (character.background) flavorFields.push({ name: "Background", value: character.background,                    inline: true });
    if (character.alignment)  flavorFields.push({ name: "Alignment",  value: character.alignment,                     inline: true });
    if (flavorFields.length) {
        embed.spliceFields(3, 0, ...flavorFields);
    }

    // Progress + details
    embed.addFields(
        { name: "XP Freeze",       value: isFrozen, inline: true },
        { name: "XP Share",        value: isShare,  inline: true },
        { name: "Ping on Award",   value: isPing,   inline: true },
        { name: "Progress",        value: progressBar, inline: false },
        { name: "Level XP",        value: `\`${currentLevelXp} / ${xpToNext}\` (${Math.floor((currentLevelXp / Math.max(xpToNext, 1)) * 100)}%)`, inline: false },
        { name: "\u200B",          value: `**Support:** [Ko‑fi](${DONATE_URL}) • **Dev:** [Join](${DEV_SERVER_URL})`, inline: false }
    );

    if (character.sheet_url) {
        embed.setURL(character.sheet_url);
    }

    return embed;
}

module.exports = {
    buildCharacterEmbed,
    getTierVisuals
};
