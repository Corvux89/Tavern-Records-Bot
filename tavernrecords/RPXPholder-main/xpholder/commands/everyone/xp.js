const { SlashCommandBuilder } = require('@discordjs/builders');
const { ActionRowBuilder, ButtonBuilder, EmbedBuilder, ButtonStyle } = require('discord.js');

const {
    XPHOLDER_RETIRE_COLOUR,
    XPHOLDER_LEVEL_UP_COLOUR
} = require("../../config.json");

const {
    getActiveCharacterIndex,
    getTier,
    getLevelInfo,
    safeChannelSend,
    logSuccess
} = require("../../utils");

const { buildCharacterEmbed, getTierVisuals } = require("../../utils/embedBuilder");

// Local helper – emoji progress bar (used for retire embed)
function getEmojiProgressBar(currentXP, neededXP, barLength = 10, emoji = '🟦') {
    if (!neededXP || neededXP <= 0 || isNaN(currentXP) || isNaN(neededXP)) {
        return `${'⬛'.repeat(barLength)} 0%`;
    }
    const percent = Math.min(currentXP / neededXP, 1);
    const filled = Math.round(barLength * percent);
    const empty = barLength - filled;
    return `${emoji.repeat(filled)}${'⬛'.repeat(empty)} ${Math.floor(percent * 100)}%`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('xp')
        .setDescription('Shows Player Character XP')
        .addUserOption(option =>
            option.setName("player")
                .setDescription("The player whose XP card you want to view")
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option.setName("character")
                .setDescription("Which character index to open (1–10). Defaults to their active.")
                .setMinValue(1)
                .setMaxValue(10)
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName("public")
                .setDescription("Show this command to everyone?")
                .setRequired(false)
        ),

    async execute(guildService, interaction) {
        // Acknowledge early to avoid Unknown interaction/NotReplied
        try {
            const isPublic = interaction.options.getBoolean("public") ?? false;
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ flags: isPublic ? undefined : (1 << 6) /* MessageFlags.Ephemeral */ });
            }
        } catch (_) {}

        const guild = interaction.member.guild;
        const isPublic = interaction.options.getBoolean("public") ?? false;

        const user = interaction.options.getUser("player") || interaction.user;
        const explicitIndex = interaction.options.getInteger("character");

        const player = await guild.members.fetch(user.id).catch(() => null);
        if (!player) {
            await interaction.editReply("I couldn't fetch that member. Are they still in the server?");
            return;
        }

        const playerCharacters = await guildService.getAllCharacters(player.id);
        if (!playerCharacters || playerCharacters.length === 0) {
            await interaction.editReply(`Sorry, ${player} has no characters.`);
            return;
        }

        // Find which page we should show initially
        let startIndex = 0;
        if (explicitIndex) {
            const found = playerCharacters.findIndex(c => Number(c.character_index) === explicitIndex);
            startIndex = found >= 0 ? found : 0;
        } else {
            const activeIndex = getActiveCharacterIndex(guildService.config, player._roles);
            const found = playerCharacters.findIndex(c => Number(c.character_index) === activeIndex);
            startIndex = found >= 0 ? found : 0;
        }

        // Build embeds
        const characterEmbeds = [];
        for (let i = 0; i < playerCharacters.length; i++) {
            const character = playerCharacters[i];
            if (!character.picture_url || character.picture_url === "null") {
                character.picture_url = player.user.displayAvatarURL();
            }
            const embed = await buildCharacterEmbed(guildService, guild, player, character, i);
            characterEmbeds.push(embed);
        }

        // Button rows
        const makeComponents = (self, publicView) => {
            if (self && !publicView) {
                const row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('xp_previous').setLabel('<').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('xp_next').setLabel('>').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('xp_set').setLabel('Set').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('xp_freeze').setLabel('Freeze').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('xp_retire').setLabel('Retire').setStyle(ButtonStyle.Danger)
                );
                const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('xp_toggle_ping').setLabel('Ping').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('xp_toggle_share').setLabel('Share').setStyle(ButtonStyle.Secondary)
                );
                return [row1, row2];
            }
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('xp_previous').setLabel('<').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('xp_next').setLabel('>').setStyle(ButtonStyle.Secondary)
            );
            return [row];
        };

        const selfView = player.id === interaction.user.id;
        const baseComponents = makeComponents(selfView, isPublic);

        // Send initial message and fetch the Message to attach a collector
        const replyMessage = await interaction.editReply({
            embeds: [characterEmbeds[startIndex]],
            components: baseComponents
        }).then(() => interaction.fetchReply());

        createButtonEvents(
            guildService,
            interaction,
            player,
            replyMessage,
            playerCharacters,
            characterEmbeds,
            startIndex,
            baseComponents
        );
    }
};

function createButtonEvents(
    guildService,
    interaction,
    player,
    replyMessage,
    playerCharacters,
    characterEmbeds,
    embedCharacterIndex,
    baseComponents
) {
    const guild = interaction.member.guild;
    let pageIndex = embedCharacterIndex;
    let retireConfirming = false;

    // Only allow the command invoker to use the controls
    const filter = btnInteraction =>
        [
            'xp_previous',
            'xp_next',
            'xp_set',
            'xp_freeze',
            'xp_retire',
            'xp_retire_confirm',
            'xp_retire_cancel',
            'xp_toggle_ping',
            'xp_toggle_share'
        ].includes(btnInteraction.customId) &&
        replyMessage.id === btnInteraction.message.id &&
        btnInteraction.user.id === interaction.user.id;

    const collector = replyMessage.createMessageComponentCollector({ filter, time: 15 * 60 * 1000 });

    collector.on('collect', async btnInteraction => {
        try {
            switch (btnInteraction.customId) {
                case "xp_previous": {
                    retireConfirming = false;
                    pageIndex = Math.max(pageIndex - 1, 0);
                    await btnInteraction.update({ embeds: [characterEmbeds[pageIndex]], components: baseComponents });
                    break;
                }

                case "xp_next": {
                    retireConfirming = false;
                    pageIndex = Math.min(pageIndex + 1, characterEmbeds.length - 1);
                    await btnInteraction.update({ embeds: [characterEmbeds[pageIndex]], components: baseComponents });
                    break;
                }

                case "xp_set": {
                    retireConfirming = false;
                    const newCharacter = playerCharacters[pageIndex];

                    // Compute tier of the selected character
                    const newCharacterLevelInfo = getLevelInfo(guildService.levels, newCharacter.xp);
                    const newCharacterTier = getTier(newCharacterLevelInfo.level);

                    // Build role arrays
                    const removeRoles = [];
                    const addRoles = [];

                    // Remove all other character roles
                    for (let charIndex = 1; charIndex <= Number(guildService.config.characterCount || 1); charIndex++) {
                        if (charIndex !== Number(newCharacter.character_index)) {
                            const rid = guildService.config[`character${charIndex}RoleId`];
                            if (!rid) continue;
                            const role = await guild.roles.fetch(rid).catch(() => null);
                            if (role) removeRoles.push(role);
                        }
                    }

                    // Add the selected character role
                    {
                        const rid = guildService.config[`character${Number(newCharacter.character_index)}RoleId`];
                        if (rid) {
                            const role = await guild.roles.fetch(rid).catch(() => null);
                            if (role) addRoles.push(role);
                        }
                    }

                    // Remove other tier roles
                    for (let tierIndex = 1; tierIndex <= 4; tierIndex++) {
                        if (tierIndex !== newCharacterTier.tier) {
                            const rid = guildService.config[`tier${tierIndex}RoleId`];
                            if (!rid) continue;
                            const role = await guild.roles.fetch(rid).catch(() => null);
                            if (role) removeRoles.push(role);
                        }
                    }

                    // Add current tier role
                    {
                        const rid = guildService.config[`tier${newCharacterTier.tier}RoleId`];
                        if (rid) {
                            const role = await guild.roles.fetch(rid).catch(() => null);
                            if (role) addRoles.push(role);
                        }
                    }

                    // Apply roles (with friendly error if permissions missing)
                    try {
                        if (removeRoles.length) await player.roles.remove(removeRoles).catch(() => {});
                        if (addRoles.length)    await player.roles.add(addRoles).catch(() => {});
                    } catch (e) {
                        console.error("[xp_set] role update error:", e);
                        try {
                            await btnInteraction.followUp({
                                ephemeral: true,
                                content: "I don't have permission to change your roles. Ask an admin to grant **Manage Roles** and move my top role above Character/Tier/XP roles."
                            });
                        } catch (_) {}
                    }

                    // Rebuild embed to show any changes & add success description
                    const updatedEmbed = await buildCharacterEmbed(guildService, guild, player, newCharacter, pageIndex);
                    updatedEmbed
                        .setTitle(newCharacter.name)
                        .setDescription("**SUCCESS:** Character is now active.");

                    characterEmbeds[pageIndex] = updatedEmbed;
                    await btnInteraction.update({ embeds: [updatedEmbed], components: baseComponents });
                    break;
                }

                case "xp_freeze": {
                    retireConfirming = false;
                    const xpFreezeRoleId = guildService.config["xpFreezeRoleId"];
                    const xpFreezeRole = xpFreezeRoleId ? await guild.roles.fetch(xpFreezeRoleId).catch(() => null) : null;

                    let freezeMessage = "";
                    try {
                        if (xpFreezeRole) {
                            if (player.roles.cache.has(xpFreezeRoleId)) {
                                await player.roles.remove(xpFreezeRole);
                                freezeMessage = "Removed";
                            } else {
                                await player.roles.add(xpFreezeRole);
                                freezeMessage = "Added";
                            }
                        } else {
                            freezeMessage = "Role not found";
                        }
                    } catch (e) {
                        console.error("[xp_freeze] role update error:", e);
                        freezeMessage = "Missing Permissions (ask an admin to move my role up & grant Manage Roles)";
                        try {
                            await btnInteraction.followUp({
                                ephemeral: true,
                                content: "I couldn't toggle XP Freeze due to missing permissions. Ask an admin to move my top role above your Character/Tier/XP roles and grant **Manage Roles**."
                            });
                        } catch (_) {}
                    }

                    const currentEmbed = characterEmbeds[pageIndex];
                    const data = currentEmbed.data ?? {};
                    const copyOfEmbed = new EmbedBuilder()
                        .setTitle(data.title || "Character")
                        .setDescription(`**SUCCESS:** XP Freeze Role ${freezeMessage}`)
                        .setFields(Array.isArray(data.fields) ? data.fields : [])
                        .setThumbnail(data.thumbnail?.url ?? null)
                        .setColor(XPHOLDER_LEVEL_UP_COLOUR);

                    characterEmbeds[pageIndex] = copyOfEmbed;
                    await btnInteraction.update({ embeds: [copyOfEmbed], components: baseComponents });
                    break;
                }

                case "xp_toggle_ping": {
                    retireConfirming = false;

                    const currentChar = playerCharacters[pageIndex];
                    const freshRow = await guildService.getCharacterByIndex(player.id, currentChar.character_index);
                    const currentFlag = (freshRow?.ping_on_award ?? 1) === 1;
                    const nextFlag = !currentFlag;

                    try {
                        await guildService.setCharacterPing(`${player.id}-${currentChar.character_index}`, nextFlag);
                    } catch (e) {
                        console.error("[xp_toggle_ping] setCharacterPing failed:", e);
                    }

                    playerCharacters[pageIndex].ping_on_award = nextFlag ? 1 : 0;

                    const data = (characterEmbeds[pageIndex] && characterEmbeds[pageIndex].data) || {};
                    const emb = new EmbedBuilder()
                        .setTitle(data.title || (currentChar.name || "Character"))
                        .setFields(Array.isArray(data.fields) ? data.fields : [])
                        .setThumbnail(data.thumbnail?.url ?? null)
                        .setColor(XPHOLDER_LEVEL_UP_COLOUR)
                        .setDescription(`**SUCCESS:** Ping on award: **${nextFlag ? "On" : "Off"}**`);

                    characterEmbeds[pageIndex] = emb;
                    await btnInteraction.update({ embeds: [emb], components: baseComponents });
                    break;
                }

                case "xp_toggle_share": {
                    retireConfirming = false;

                    const xpShareRoleId = guildService.config["xpShareRoleId"];
                    const xpShareRole = xpShareRoleId ? await guild.roles.fetch(xpShareRoleId).catch(() => null) : null;

                    let msg = "";
                    try {
                        if (xpShareRole) {
                            if (player.roles.cache.has(xpShareRoleId)) {
                                await player.roles.remove(xpShareRole);
                                msg = "XP Share: **Off**";
                            } else {
                                await player.roles.add(xpShareRole);
                                msg = "XP Share: **On**";
                            }
                        } else {
                            msg = "XP Share role not found. Ask an admin to re-run `/register`.";
                        }
                    } catch (e) {
                        console.error("[xp_toggle_share] role update error:", e);
                        msg = "Missing Permissions (ask an admin to move my role up & grant Manage Roles)";
                        try {
                            await btnInteraction.followUp({
                                ephemeral: true,
                                content: "I couldn't toggle XP Share due to missing permissions. Ask an admin to move my top role above your Character/Tier/XP roles and grant **Manage Roles**."
                            });
                        } catch (_) {}
                    }

                    const data = (characterEmbeds[pageIndex] && characterEmbeds[pageIndex].data) || {};
                    const emb = new EmbedBuilder()
                        .setTitle(data.title || (playerCharacters[pageIndex].name || "Character"))
                        .setFields(Array.isArray(data.fields) ? data.fields : [])
                        .setThumbnail(data.thumbnail?.url ?? null)
                        .setColor(XPHOLDER_LEVEL_UP_COLOUR)
                        .setDescription(`**SUCCESS:** ${msg}`);

                    characterEmbeds[pageIndex] = emb;
                    await btnInteraction.update({ embeds: [emb], components: baseComponents });
                    break;
                }

                case "xp_retire": {
                    if (!retireConfirming) {
                        retireConfirming = true;

                        const confirmRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('xp_retire_confirm').setLabel('Confirm Retire').setStyle(ButtonStyle.Danger),
                            new ButtonBuilder().setCustomId('xp_retire_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
                        );

                        const currentEmbed = characterEmbeds[pageIndex];
                        const confirmEmbed = new EmbedBuilder()
                            .setTitle("Retire Character?")
                            .setDescription("**WARNING:** Are you sure you want to retire?\n\nClick **Confirm Retire** to proceed, or **Cancel** to abort.")
                            .setColor(XPHOLDER_RETIRE_COLOUR);

                        await btnInteraction.update({ embeds: [confirmEmbed, currentEmbed], components: [confirmRow] });
                    }
                    break;
                }

                case "xp_retire_cancel": {
                    retireConfirming = false;
                    await btnInteraction.update({ embeds: [characterEmbeds[pageIndex]], components: baseComponents });
                    break;
                }

                case "xp_retire_confirm": {
                    retireConfirming = false;

                    const retiringCharacter = playerCharacters[pageIndex];

                    // Remove all character & tier roles (best-effort)
                    const removeRoles = [];
                    for (let charIndex = 1; charIndex <= Number(guildService.config.characterCount || 1); charIndex++) {
                        const rid = guildService.config[`character${charIndex}RoleId`];
                        if (!rid) continue;
                        const role = await guild.roles.fetch(rid).catch(() => null);
                        if (role) removeRoles.push(role);
                    }
                    for (let tierIndex = 1; tierIndex <= 4; tierIndex++) {
                        const rid = guildService.config[`tier${tierIndex}RoleId`];
                        if (!rid) continue;
                        const role = await guild.roles.fetch(rid).catch(() => null);
                        if (role) removeRoles.push(role);
                    }
                    try { await player.roles.remove(removeRoles.filter(Boolean)); } catch (e) {
                        console.error("[xp_retire_confirm] remove roles error:", e);
                        try {
                            await btnInteraction.followUp({
                                ephemeral: true,
                                content: "I couldn't remove some roles due to missing permissions. Ask an admin to move my role up & grant Manage Roles."
                            });
                        } catch (_) {}
                    }

                    // Delete character
                    try {
                        await guildService.deleteCharacter(retiringCharacter);
                    } catch (e) {
                        console.error("[xp_retire_confirm] delete character error:", e);
                    }

                    // Build retire embed with tier visuals + bar
                    const levelInfo = getLevelInfo(guildService.levels, retiringCharacter.xp);
                    const tierInfo = getTier(parseInt(levelInfo.level));
                    const { emoji } = await getTierVisuals(guild, guildService.config[`tier${tierInfo.tier}RoleId`]);
                    const currentLevelXp = Math.floor(levelInfo.levelXp ?? 0);
                    const xpToNext = Math.floor(levelInfo.xpToNext ?? 1);
                    const progressBar = getEmojiProgressBar(currentLevelXp, xpToNext, 10, emoji);

                    const retiredEmbed = new EmbedBuilder()
                        .setTitle(`${retiringCharacter.name} Retired`)
                        .setDescription("**RETIRED**")
                        .addFields(
                            { name: "Character Index", value: `${retiringCharacter.character_index}`, inline: true },
                            { name: "Final Level", value: `${levelInfo.level}`, inline: true },
                            { name: "Tier", value: `<@&${guildService.config[`tier${tierInfo.tier}RoleId`]}>`, inline: true },
                            { name: "Level XP", value: `${currentLevelXp} / ${xpToNext}`, inline: true },
                            { name: "Progress", value: progressBar, inline: false }
                        )
                        .setThumbnail(
                            retiringCharacter.picture_url && retiringCharacter.picture_url !== "null"
                                ? retiringCharacter.picture_url
                                : null
                        )
                        .setColor(XPHOLDER_RETIRE_COLOUR);

                    // Announce in level-up channel
                    let awardChannel = null;
                    try { awardChannel = await guild.channels.fetch(guildService.config["levelUpChannelId"]); } catch (_) {}
                    const content = player ? `<@${player.id}>` : undefined;

                    if (awardChannel) {
                        await safeChannelSend(
                            awardChannel,
                            {
                                content,
                                allowedMentions: content ? { users: [player.id] } : undefined,
                                embeds: [retiredEmbed]
                            },
                            interaction
                        );
                    }

                    // Structured log entry for retirement
                    try {
                        await logSuccess(
                            interaction,
                            `Character retired: ${retiringCharacter.name}`,
                            [
                                { name: "Player", value: `<@${player.id}>`, inline: true },
                                { name: "Character Index", value: `${retiringCharacter.character_index}`, inline: true },
                                { name: "Final Level", value: `${levelInfo.level}`, inline: true }
                            ]
                        );
                    } catch (_) {}

                    await btnInteraction.update({ embeds: [retiredEmbed], components: [] });
                    collector.stop('retired');
                    break;
                }
            }
        } catch (error) {
            console.error("[xp collector] error:", error);
            try { await btnInteraction.followUp({ ephemeral: true, content: "Something went wrong handling that action." }); } catch (_) {}
        }
    });

    collector.on('end', async () => {
        try {
            await replyMessage.edit({ components: [] }).catch(() => {});
        } catch (_) {}
    });
}
