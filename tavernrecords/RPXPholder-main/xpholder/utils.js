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
    TESTING_SERVER_ID,
    LOGING_CHANNEL_ID,
    ERROR_CHANNEL_ID
} = require("./config.json");

/*
------
AWARDS
------
*/
function awardCP(startingXp, cp, levels) {
    for (; cp > 0; cp--) {
        startingXp += awardSingleCP(startingXp, levels);
    }
    return startingXp;
}

function awardSingleCP(xp, levels) {
    const levelInfo = getLevelInfo(levels, xp);
    return Number(levelInfo.level) < 4
        ? levelInfo.xpToNext / 4
        : levelInfo.xpToNext / 8;
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

function getTier(level) {
    const lvl = Number(level) || 1;
    if (lvl <= 4) return { tier: 1, nextTier: 2 };
    if (lvl <= 10) return { tier: 2, nextTier: 3 };
    if (lvl <= 16) return { tier: 3, nextTier: 4 };
    return { tier: 4, nextTier: 4 };
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
        await channel.send(payload);
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
async function updateMemberTierRole(guild, guildService, member, level) {
    try {
        const n = Number(level) || 1;
        let newTier = 1;
        if (n <= 4) newTier = 1;
        else if (n <= 10) newTier = 2;
        else if (n <= 16) newTier = 3;
        else newTier = 4;

        const removeRoles = [];
        const addRoles = [];

        // Remove all other tier roles
        for (let t = 1; t <= 4; t++) {
            if (t !== newTier) {
                const rid = guildService.config[`tier${t}RoleId`];
                if (!rid) continue;
                const r = await guild.roles.fetch(rid).catch(() => null);
                if (r) removeRoles.push(r);
            }
        }

        // Add current tier role
        {
            const rid = guildService.config[`tier${newTier}RoleId`];
            if (rid) {
                const r = await guild.roles.fetch(rid).catch(() => null);
                if (r) addRoles.push(r);
            }
        }

        if (removeRoles.length) await member.roles.remove(removeRoles).catch(() => {});
        if (addRoles.length)    await member.roles.add(addRoles).catch(() => {});

        return newTier;
    } catch (e) {
        console.warn("[utils.updateMemberTierRole] failed:", e?.message);
        return null;
    }
}

module.exports = {
    awardCP,
    getActiveCharacterIndex,
    getLevelInfo,
    getRoleMultiplier,
    getTier,
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
    updateMemberTierRole
};
