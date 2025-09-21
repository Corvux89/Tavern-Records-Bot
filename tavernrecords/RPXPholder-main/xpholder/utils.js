/**
 * TavernRecords XP Bot - Core Utility
 * Based on code by JTexpo, maintained by Ravenwingz
 * Licensed under MIT with Attribution (see LICENSE and NOTICE)
 */

const { EmbedBuilder } = require('discord.js');
const {
    XPHOLDER_COLOUR,
    XPHOLDER_ICON_URL,
    DONATE_URL,
    XPHOLDER_RETIRE_COLOUR,
    DEV_SERVER_URL,
    TESTING_SERVER_ID,
    LOGING_CHANNEL_ID,
    ERROR_CHANNEL_ID
} = require("./config.json");

/*
------
AWARDS
------
*/
function awardCP(guildService, startingXp, cp) {
    const lvlInfo = getLevelInfo(guildService.levels, startingXp)
    const tierInfo = getTierInfo(guildService.tiers, lvlInfo.level)
    const cpXp = tierInfo.cp_percent * lvlInfo.xpToNext

    return startingXp + (cpXp * cp)
}

/*
-------
MAPPERS
-------
*/
function mergeListOfObjects(listOfObjects) {
    return Object.assign({}, ...listOfObjects);
}

function chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

function splitObjectToList(obj) {
    return Object.entries(obj).map(([k, v]) => ({ [k]: v }));
}

function listOfObjsToObj(list, key, value) {
    return list.reduce((acc, obj) => {
        acc[obj[key]] = obj[value];
        return acc;
    }, {});
}

/*
-------
GETTERS
-------
*/
function getActiveCharacterIndex(config, roles) {
    const count = Number(config?.characterCount) || 1;
    const roleIds = Array.isArray(roles) ? roles : [];
    for (let i = 1; i <= count; i++) {
        const rid = config[`character${i}RoleId`];
        if (rid && roleIds.includes(rid)) return i;
    }
    return 1;
}

function getLevelInfo(levels, xp) {
    // Ensure deterministic order: sort level keys numerically ascending
    const entries = Object.entries(levels)
        .map(([lvl, xpToNext]) => [Number(lvl), Number(xpToNext)])
        .sort((a, b) => a[0] - b[0]);

    let remaining = Number(xp) || 0;
    for (const [lvl, xpToNext] of entries) {
        remaining -= xpToNext;
        if (remaining < 0) {
            remaining += xpToNext;
            return { level: lvl, levelXp: remaining, xpToNext };
        }
    }
    // Past max level: treat as max
    const last = entries[entries.length - 1] ?? [20, 0];
    return { level: last[0], levelXp: remaining, xpToNext: remaining };
}

function getRoleMultiplier(type, guildRoles, userRoles) {
    let multiplier = 1;
    switch (type) {
        case "highest":
            for (const id of userRoles) {
                if (!(id in guildRoles)) continue;
                const bonus = guildRoles[id];
                if (bonus === 0) return 0;
                if (bonus > multiplier) multiplier = bonus;
            }
            break;
        case "sum":
            for (const id of userRoles) {
                if (!(id in guildRoles)) continue;
                const bonus = guildRoles[id];
                if (bonus === 0) return 0;
                multiplier += bonus;
            }
            break;
    }
    return multiplier;
}

function getTierInfo(tiers, level) {
    for ([tier, data] of Object.entries(tiers)) {
        if (level >= data.min_level && level <= data.max_level){
            return {"tier": tier, min_level: data.min_level, max_level: data.max_level, cp_percent: data.cp_percent / 100}
        }
    }
}

function getXp(words, roleBonus, channelXp, divisor, formula) {
    switch (formula) {
        case "exponential":
            return (channelXp + words / divisor) * (1 + words / divisor) * roleBonus;
        case "flat":
            return channelXp * roleBonus;
        case "linear":
            return (channelXp + words / divisor) * roleBonus;
        default:
            return 0;
    }
}

function getProgressionBar(current, max, size = 10) {
    const percentage = Math.min((Number(current) || 0) / Math.max(Number(max) || 1, 1), 1);
    const filled = Math.round(size * percentage);
    const empty = size - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

/*
-------
LOGGING
-------
*/

// Internal: get a channel safely for logging
async function getLogChannel(client, guildId, channelId) {
    try {
        const guild = await client.guilds.fetch(guildId);
        const channel = await guild.channels.fetch(channelId);
        return channel || null;
    } catch {
        return null;
    }
}

// Internal: send an embed to a log channel if possible
async function pushLogEmbed(client, guildId, channelId, embed) {
    try {
        const channel = await getLogChannel(client, guildId, channelId);
        if (!channel) return false;
        await channel.send({ embeds: [embed] });
        return true;
    } catch (e) {
        console.error("[Logging] Failed to push log embed:", e);
        return false;
    }
}

// Public: safer send wrapper for any channel
async function safeChannelSend(channel, payload, interaction) {
    if (!channel) return;
    try {
        return await channel.send(payload);
    } catch (err) {
        if (err.code === 50001) { // Missing Access
            console.warn(`[safeChannelSend] No access to channel ${channel.id} in guild ${channel.guild?.name}`);

            // Try to alert server owner
            try {
                const owner = await channel.guild.fetchOwner();
                await owner.send(
                    `⚠️ Tavern Records bot could not post in <#${channel.id}>. 
Please run \`/edit_config level_up_channel\` to set a working channel.`
                );
            } catch (dmErr) {
                console.warn(`[safeChannelSend] Could not DM owner of guild ${channel.guild?.id}:`, dmErr.message);
            }
        } else {
            console.error("[safeChannelSend] Failed:", err);
        }
    }
}

async function logCommand(interaction) {
    try {
        const logEmbed = new EmbedBuilder()
            .setTitle("Command Was Used")
            .addFields(
                { name: "Guild", value: `${interaction.guild?.name ?? 'Unknown'}` },
                { name: "Guild Id", value: `${interaction.guild?.id ?? 'Unknown'}` },
                { name: "Author", value: `${interaction.user?.username ?? 'Unknown'}` },
                { name: "Author Id", value: `${interaction.user?.id ?? 'Unknown'}` },
                { name: "Command", value: `${interaction.commandName ?? 'Unknown'}` },
            )
            .setTimestamp()
            .setColor(XPHOLDER_COLOUR)
            .setThumbnail(`${interaction.client?.user?.avatarURL?.() ?? XPHOLDER_ICON_URL}`)
            .setURL(DONATE_URL)
            .setFooter({ text: `Support the bot: ${DONATE_URL}` });

        const options = interaction.options?._hoistedOptions ?? [];

        for (const option of options) {
            const value = option?.value?.toString?.() ?? String(option?.value ?? '');
            if (option?.name && value) {
                logEmbed.addFields({ name: option.name, value: value.slice(0, 1024), inline: true });
            }
        }

        await pushLogEmbed(interaction.client, TESTING_SERVER_ID, LOGING_CHANNEL_ID, logEmbed);
    } catch (e) {
        console.error("[logCommand] error:", e);
    }
}

async function logError(interaction, error) {
    try {
        const errorEmbed = new EmbedBuilder()
            .setTitle("An Error Has Occurred")
            .setDescription(`${String(error).slice(0, 4000)}`)
            .addFields(
                { name: "Guild", value: `${interaction.guild?.name ?? 'Unknown'}` },
                { name: "Guild Id", value: `${interaction.guild?.id ?? 'Unknown'}` },
                { name: "Author", value: `${interaction.user?.username ?? 'Unknown'}` },
                { name: "Author Id", value: `${interaction.user?.id ?? 'Unknown'}` },
                { name: "Command", value: `${interaction.commandName ?? 'Unknown'}` },
            )
            .setTimestamp()
            .setColor(XPHOLDER_RETIRE_COLOUR)
            .setThumbnail(`${interaction.client?.user?.avatarURL?.() ?? XPHOLDER_ICON_URL}`)
            .setURL(DONATE_URL)
            .setFooter({ text: `Support the bot: ${DONATE_URL}` });

    const options = interaction.options?._hoistedOptions ?? [];
        for (const option of options) {
            const value = option?.value?.toString?.() ?? String(option?.value ?? '');
            if (option?.name && value) {
                errorEmbed.addFields({ name: option.name, value: value.slice(0, 1024), inline: true });
            }
        }

        await pushLogEmbed(interaction.client, TESTING_SERVER_ID, ERROR_CHANNEL_ID, errorEmbed);
    } catch (e) {
        console.error("[logError] error:", e);
    }
}

// New: success logger
async function logSuccess(interaction, summary, extraFields = []) {
    try {
        const ok = new EmbedBuilder()
            .setTitle("Action Succeeded")
            .setDescription(summary?.toString().slice(0, 4000) || "Success")
            .addFields(
                { name: "Guild", value: `${interaction.guild?.name ?? "Unknown"}` },
                { name: "Guild Id", value: `${interaction.guild?.id ?? "Unknown"}` },
                { name: "Author", value: `${interaction.user?.username ?? "Unknown"}` },
                { name: "Author Id", value: `${interaction.user?.id ?? "Unknown"}` },
                { name: "Command", value: `${interaction.commandName ?? "Unknown"}` },
                ...extraFields
            )
            .setTimestamp()
            .setColor(XPHOLDER_COLOUR)
            .setThumbnail(`${interaction.client?.user?.avatarURL?.() ?? XPHOLDER_ICON_URL}`)
            .setURL(DONATE_URL)
            .setFooter({ text: `Support the bot: ${DONATE_URL}` });

        await pushLogEmbed(interaction.client, TESTING_SERVER_ID, LOGING_CHANNEL_ID, ok);
    } catch (e) {
        console.error("[logSuccess] error:", e);
    }
}

/*
--------
SECURITY
--------
*/
function sqlInjectionCheck(str) {
    return /[`'";,]|drop|delete|remove|update|create|insert/i.test(str);
}

/*
-------------------------
Tier role updater helper
-------------------------
*/
async function updateMemberTierRoles(guild, guildService, member){
    try {
        const characters = await guildService.getAllCharacters(member.id);
        const rolesToRemove = [];
        const rolesToAdd = [];
        const characterTiers = [...new Set(characters.map(char => {
            const levelInfo = getLevelInfo(guildService.levels, char.xp)
            return getTierInfo(guildService.tiers, levelInfo.level).tier
        }))];

        for (const tierNumber of Object.keys(guildService.tiers)){
            const role = await guild.roles.fetch(guildService.config[`tier${tierNumber}RoleId`]).catch(() => null);

            if (role){
                if (characterTiers.includes(parseInt(tierNumber))){
                    rolesToAdd.push(role)
                } else{
                    rolesToRemove.push(role)
                }
            }
        }

        if (rolesToRemove.length) await member.roles.remove(rolesToRemove).catch(() => {});
        if (rolesToAdd.length)    await member.roles.add(rolesToAdd).catch(() => {});
    } catch (e) {
        console.warn("[utils.updateMemberTierRoles] failed:", e?.message);
        return null;
    }
}

/*
-------------------------
Embeds
-------------------------
*/

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
 * Build the character embed with tier-colored progress bar and matching embed color.
 */
async function buildCharacterEmbed(guildService, guild, player, character, index) {
    const levelInfo = getLevelInfo(guildService.levels, character.xp);
    const tierInfo = getTierInfo(guildService.tiers, levelInfo.level);

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
    awardCP,
    getActiveCharacterIndex,
    getLevelInfo,
    getRoleMultiplier,
    getTierInfo,
    getXp,
    getProgressionBar,
    mergeListOfObjects,
    chunkArray,
    splitObjectToList,
    listOfObjsToObj,
    logCommand,
    logError,
    logSuccess,
    sqlInjectionCheck,
    safeChannelSend,
    updateMemberTierRoles,
    getTierVisuals,
    buildCharacterEmbed
};
