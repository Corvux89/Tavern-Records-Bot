const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageFlags } = require('discord-api-types/v10');
const { ActionRowBuilder, ButtonBuilder, EmbedBuilder, ButtonStyle } = require('discord.js');

const {
    XPHOLDER_COLOUR,
    XPHOLDER_ICON_URL,
    XPHOLDER_LEVEL_UP_COLOUR,
    XPHOLDER_RETIRE_COLOUR,
    DONATE_URL
} = require("../../config.json");

const { getLevelInfo, awardCP, logSuccess, safeChannelSend, updateMemberTierRoles, getTierInfo, getTierVisuals } = require("../../utils");

// Local helper – emoji progress bar
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
        .setName('award_xp')
        .setDescription('Rewards The Player With XP / CP! [ MOD ]')
        .addUserOption(option => option
            .setName("player")
            .setDescription("The Player You Wish To Edit")
            .setRequired(true))
        .addIntegerOption(option => option
            .setName("character")
            .setDescription("Which Character You Want To Approve ( 1 -> 10 )")
            .setMinValue(1)
            .setMaxValue(10)
            .setRequired(true))
        .addStringOption(option => option
            .setName("award_type")
            .setDescription("The Field That You Want To Manage Of A User")
            .addChoices(
                { name: "Set Level", value: "set_level" },
                { name: "Set XP", value: "set_xp" },
                { name: "Give XP", value: "give_xp" },
                { name: "Set CP", value: "set_cp" },
                { name: "Give CP", value: "give_cp" }
            )
            .setRequired(true))
        .addIntegerOption(option => option
            .setName("value")
            .setDescription("The Value For What Is Being Managed")
            .setRequired(true))
        .addStringOption(option => option
            .setName("memo")
            .setDescription("A Small Note On Why The Reward")
            .setRequired(false))
        .addBooleanOption(option => option
            .setName("public")
            .setDescription("Show This Command To Everyone?")
            .setRequired(false)),

    async execute(guildService, interaction) {
        // Defer ASAP (guard for safety)
        const isPublic = interaction.options.getBoolean("public") ?? false;
        if (!interaction.deferred && !interaction.replied) {
            try {
                await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral });
            } catch (_) {}
        }

        try {
            // Permission check
            if (!guildService.isMod(interaction.member._roles) &&
                interaction.user.id != interaction.guild.ownerId) {
                await interaction.editReply("Sorry, you do not have the right role to use this command.");
                return;
            }

            const guild = interaction.member.guild;

            const playerUser = interaction.options.getUser("player");
            const characterIndex = interaction.options.getInteger("character");
            const awardType = interaction.options.getString("award_type");
            const value = interaction.options.getInteger("value");
            const memoRaw = interaction.options.getString("memo");
            const memo = memoRaw ?? `Command Requested In <#${interaction.channelId}>`;

            if (!playerUser) {
                await interaction.editReply("Could not resolve the target user.");
                return;
            }

            // Fetch level up channel
            let awardChannel = null;
            try {
                awardChannel = await guild.channels.fetch(guildService.config["levelUpChannelId"]);
            } catch (_) {}
            if (!awardChannel) {
                await interaction.editReply("Level up channel not found. Ask the owner to set it via `/edit_config`.");
                return;
            }

            // Load character (target)
            const characterId = `${playerUser.id}-${characterIndex}`;
            let character = await guildService.getCharacter(characterId);
            if (!character) {
                await interaction.editReply("Sorry, but that character does not exist.");
                return;
            }

            const oldXpTarget = Number(character.xp) || 0;
            const oldLevelInfoTarget = getLevelInfo(guildService.levels, oldXpTarget);
            const oldTierInfoTarget = getTierInfo(guildService.tiers, parseInt(oldLevelInfoTarget.level, 10));

            // Determine if XP Share split applies (role-based)
            const xpShareRoleId = guildService.config["xpShareRoleId"];
            const member = await guild.members.fetch(playerUser.id).catch(() => null);
            const hasShareRole = !!(xpShareRoleId && member && member._roles?.includes(xpShareRoleId));
            const isGiveOp = (awardType === "give_xp" || awardType === "give_cp");
            const shareSplit = hasShareRole && isGiveOp;

            // We will collect undo changes here
            let undoChanges = [];

            // After-op values for the target (used for tier/visuals)
            let newXpTarget = oldXpTarget;

            if (shareSplit) {
                // ---- SHARED AWARD (equal split across all PCs; remainder to target) ----
                const kind = (awardType === "give_cp") ? "cp" : "xp";
                const summary = await guildService.applySharedAward(playerUser.id, characterIndex, value, kind);

                // Find the target after-update record
                const tgt = summary.target;
                if (!tgt) {
                    await interaction.editReply("Unexpected error applying shared award.");
                    return;
                }

                newXpTarget = Number(tgt.newXp) || 0;
               
                // Emoji/progress for TARGET
                const newLevelInfo = getLevelInfo(guildService.levels, newXpTarget);
                const newTierInfo = getTierInfo(guildService.tiers, parseInt(newLevelInfo.level, 10));
                let emoji = '🟦';
                try {
                    const vis = await getTierVisuals(guild, guildService.config[`tier${newTierInfo.tier}RoleId`]);
                    emoji = vis.emoji || '🟦';
                } catch (_) {}
                const progressBar = getEmojiProgressBar(
                    Number(newLevelInfo.levelXp) || 0,
                    Number(newLevelInfo.xpToNext) || 1,
                    10,
                    emoji
                );

                // Build shared award embed
                const awardEmbed = new EmbedBuilder()
                    .setTitle(`${character["name"]} Received ${summary.kind.toUpperCase()} (Shared)`)
                    .setURL(DONATE_URL)
                    .setThumbnail(
                        (character["picture_url"] && character["picture_url"] !== "null")
                            ? character["picture_url"]
                            : XPHOLDER_ICON_URL
                    )
                    .setFooter({ text: `Support the bot: ${DONATE_URL}` })
                    .setDescription(String(memo || ""));

                // Level color / fields for the TARGET
                let levelFieldName = "Level";
                let levelFieldValue = String(newLevelInfo["level"]);
                if (String(oldLevelInfoTarget["level"]) !== String(newLevelInfo["level"])) {
                    levelFieldName = "Level Up!";
                    levelFieldValue = `${oldLevelInfoTarget["level"]} → **${newLevelInfo["level"]}**`;
                    awardEmbed.setColor(XPHOLDER_LEVEL_UP_COLOUR);
                } else {
                    awardEmbed.setColor(XPHOLDER_COLOUR);
                }

                // Add a summary header
                awardEmbed.addFields(
                    { inline: true, name: "Shared", value: `Yes (x${summary.count})` },
                    { inline: true, name: "Total Given", value: `${value} ${summary.kind.toUpperCase()}` },
                    { inline: true, name: levelFieldName, value: levelFieldValue }
                );

                // List per-character deltas
                for (const c of summary.changes) {
                    const delta = Math.floor(c.deltaXp);
                    const newTotal = Math.floor(c.newXp);
                    const marker = (c.character_index === Number(characterIndex)) ? " • target" : "";
                    awardEmbed.addFields({
                        inline: true,
                        name: `${c.name} (#${c.character_index})${marker}`,
                        value: `ΔXP: **${delta >= 0 ? "+" : ""}${delta}** • New: ${newTotal}`
                    });
                }

                // Progress for target
                awardEmbed.addFields(
                    { inline: false, name: "Progress (Target)", value: progressBar }
                );

                // Tier info for target
                if (oldTierInfoTarget.tier !== newTierInfo.tier) {
                    awardEmbed.addFields({
                        inline: true,
                        name: "Tier",
                        value: `${oldTierInfoTarget.tier} → **${newTierInfo.tier}**`
                    });
                }
                const tierRoleId = guildService.config[`tier${newTierInfo.tier}RoleId`];
                awardEmbed.addFields({
                    inline: true,
                    name: "Tier Role",
                    value: tierRoleId ? `<@&${tierRoleId}>` : "None"
                });

                // Undo row and payload (revert ALL characters touched)
                const undoRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId("awardxp_undo").setLabel("Undo").setStyle(ButtonStyle.Danger)
                );

                undoChanges = summary.changes.map(c => ({
                    character_id: c.character_id,
                    character_index: c.character_index,
                    player_id: playerUser.id,
                    xp: c.oldXp // restore original
                }));

                // Ping decision: based on TARGET character flag
                const wantsPing = (character?.ping_on_award ?? 1) === 1;
                const content = wantsPing ? `<@${playerUser.id}>` : undefined;
                const allowedMentions = wantsPing ? { users: [playerUser.id] } : undefined;

                const awardMessage = await safeChannelSend(
                    awardChannel,
                    {
                        content,
                        allowedMentions,
                        embeds: [awardEmbed],
                        components: [undoRow]
                    },
                    interaction
                );

                createButtonEvents(guildService, interaction, awardMessage, undoChanges);

                await interaction.editReply("Success!");

                await logSuccess(
                    interaction,
                    `Shared ${value} ${summary.kind.toUpperCase()} across ${summary.count} characters (target ${character.name})`,
                    [
                        { name: "Target Player", value: `<@${playerUser.id}>`, inline: true },
                        { name: "Target Character", value: `${character.name} (#${character.character_index})`, inline: true },
                        { name: "Kind", value: summary.kind.toUpperCase(), inline: true }
                    ]
                );

                return; // shared path done
            }

            // ---- NORMAL (non-shared) PATH ----

            // Compute new XP for SINGLE target
            let newXpCalc = oldXpTarget;
            switch (awardType) {
                case "set_level": {
                    let sum = 0;
                    for (const [level, xp] of Object.entries(guildService.levels)) {
                        if (parseInt(level, 10) < value) sum += xp;
                    }
                    newXpCalc = sum;
                    break;
                }
                case "set_xp":
                    newXpCalc = value;
                    break;
                case "give_xp":
                    newXpCalc = oldXpTarget + value;
                    break;
                case "set_cp":
                    newXpCalc = awardCP(guildService, 0, value);
                    break;
                case "give_cp":
                    newXpCalc = awardCP(guildService, oldXpTarget, value);
                    break;
                default:
                    await interaction.editReply("Invalid award type.");
                    return;
            }

            // Persist XP change BEFORE building embeds
            const characterSchema = {
                character_id: character["character_id"],
                character_index: character["character_index"],
                player_id: character["player_id"],
                xp: newXpCalc,
            };

            try {
                await guildService.setCharacterXP(characterSchema);
            } catch (dbErr) {
                console.error("[award_xp] Failed to setCharacterXP:", dbErr);
                await interaction.editReply("Failed to save XP. Please try again.");
                return;
            }

            // Update local copy
            character.xp = newXpCalc;

            // Determine new tier and update tier roles if needed
            const newLevelInfo = getLevelInfo(guildService.levels, newXpCalc);
            const newTierInfo = getTierInfo(guildService.tiers, parseInt(newLevelInfo.level, 10));
            const tierChanged = oldTierInfoTarget.tier !== newTierInfo.tier;

            await updateMemberTierRoles(guild, guildService, member)

            // Prepare visuals (emoji bar based on new tier role color)
            let emoji = '🟦';
            try {
                const vis = await getTierVisuals(guild, guildService.config[`tier${newTierInfo.tier}RoleId`]);
                emoji = vis.emoji || '🟦';
            } catch (_) {}
            const progressBar = getEmojiProgressBar(
                Number(newLevelInfo.levelXp) || 0,
                Number(newLevelInfo.xpToNext) || 1,
                10,
                emoji
            );

            // Build embed
            const awardEmbed = new EmbedBuilder()
                .setTitle(`${character["name"]} Was Awarded XP`)
                .setURL(DONATE_URL)
                .setThumbnail((character["picture_url"] && character["picture_url"] !== "null") ? character["picture_url"] : XPHOLDER_ICON_URL)
                .setFooter({ text: `Support the bot: ${DONATE_URL}` })
                .setDescription(String(memo || ""));

            let levelFieldName = "Level";
            let levelFieldValue = String(newLevelInfo["level"]);

            if (String(oldLevelInfoTarget["level"]) !== String(newLevelInfo["level"])) {
                levelFieldName = "Level Up!";
                levelFieldValue = `${oldLevelInfoTarget["level"]} → **${newLevelInfo["level"]}**`;
                awardEmbed.setColor(XPHOLDER_LEVEL_UP_COLOUR);
            } else {
                awardEmbed.setColor(XPHOLDER_COLOUR);
            }

            switch (awardType) {
                case "set_level":
                    awardEmbed.setTitle(`${character["name"]}'s Level Was Set`)
                        .setFields(
                            { inline: true, name: "Delta XP", value: `${Math.floor(oldXpTarget)} → **${Math.floor(newXpCalc)}**` },
                            { inline: true, name: "Level", value: String(newLevelInfo["level"]) },
                            { inline: false, name: "Progress", value: progressBar }
                        );
                    break;
                case "set_xp":
                    awardEmbed.setTitle(`${character["name"]}'s XP Was Set`)
                        .setFields(
                            { inline: true, name: "Delta XP", value: `${Math.floor(oldXpTarget)} → **${Math.floor(newXpCalc)}**` },
                            { inline: true, name: "Level", value: String(newLevelInfo["level"]) },
                            { inline: true, name: "Total XP", value: `${Math.floor(newXpCalc)}` },
                            { inline: false, name: "Progress", value: progressBar }
                        );
                    break;
                case "give_xp":
                    awardEmbed
                        .setFields(
                            { inline: true, name: "Delta XP", value: `${Math.floor(oldXpTarget)} → **${Math.floor(newXpCalc)}**` },
                            { inline: true, name: levelFieldName, value: levelFieldValue },
                            { inline: true, name: "XP Received", value: `${value}` },
                            { inline: false, name: "Progress", value: progressBar }
                        );
                    break;
                case "set_cp":
                    awardEmbed.setTitle(`${character["name"]}'s CP Was Set`)
                        .setFields(
                            { inline: true, name: "Delta XP", value: `${Math.floor(oldXpTarget)} → **${Math.floor(newXpCalc)}**` },
                            { inline: true, name: "Level", value: String(newLevelInfo["level"]) },
                            { inline: true, name: "Total CP", value: `${value}` },
                            { inline: false, name: "Progress", value: progressBar }
                        );
                    break;
                case "give_cp":
                    awardEmbed.setTitle(`${character["name"]} Was Awarded CP`)
                        .setFields(
                            { inline: true, name: "Delta XP", value: `${Math.floor(oldXpTarget)} → **${Math.floor(newXpCalc)}**` },
                            { inline: true, name: levelFieldName, value: levelFieldValue },
                            { inline: true, name: "CP Received", value: `${value}` },
                            { inline: false, name: "Progress", value: progressBar }
                        );
                    break;
            }

            // If tier changed, show the change
            if (tierChanged) {
                awardEmbed.addFields({
                    inline: true,
                    name: "Tier",
                    value: `${oldTierInfoTarget.tier} → **${newTierInfo.tier}**`
                });
            }

            // Always show current tier role mention
            const tierRoleId = guildService.config[`tier${newTierInfo.tier}RoleId`];
            awardEmbed.addFields({
                inline: true,
                name: "Tier Role",
                value: tierRoleId ? `<@&${tierRoleId}>` : "None"
            });

            const undoRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("awardxp_undo")
                    .setLabel("Undo")
                    .setStyle(ButtonStyle.Danger)
            );

            // 🔔 Per-character ping: only ping the player if their character has ping_on_award enabled
            const wantsPing = (character?.ping_on_award ?? 1) === 1;
            const content = wantsPing ? `<@${playerUser.id}>` : undefined;
            const allowedMentions = wantsPing ? { users: [playerUser.id] } : undefined;

            // Safe send
            const awardMessage = await safeChannelSend(
                awardChannel,
                {
                    content,
                    allowedMentions,
                    embeds: [awardEmbed],
                    components: [undoRow]
                },
                interaction
            );

            // Undo for single target
            undoChanges = [{
                character_id: character["character_id"],
                character_index: character["character_index"],
                player_id: character["player_id"],
                xp: oldXpTarget
            }];

            createButtonEvents(guildService, interaction, awardMessage, undoChanges);

            await interaction.editReply("Success!");

            // ✅ Structured success log
            await logSuccess(
                interaction,
                `Awarded ${value} via ${awardType} to ${character.name}`,
                [
                    { name: "Target Player", value: `<@${playerUser.id}>`, inline: true },
                    { name: "Character", value: `${character.name} (#${character.character_index})`, inline: true },
                    { name: "New XP", value: `${Math.floor(newXpCalc)}`, inline: true }
                ]
            );

        } catch (err) {
            console.error("[award_xp] Unhandled error:", err);
            try {
                await interaction.editReply("Something went wrong while awarding XP. Check bot logs for details.");
            } catch (_) {}
        }
    },
};

/**
 * Enhanced Undo:
 * - Fetches current XP for each affected character
 * - Shows a per-character line with the reverted delta and XP snapshot
 */
function createButtonEvents(guildService, interaction, message, undoChanges) {
    let undone = false;

    const filter = btn =>
        btn.customId === "awardxp_undo" &&
        btn.message.id === message.id &&
        btn.user.id === interaction.user.id;

    const collector = message.channel.createMessageComponentCollector({ filter, time: 15 * 60 * 1000 });

    collector.on('collect', async btn => {
        await btn.deferUpdate().catch(() => {});

        if (undone) {
            try { await message.edit({ components: [] }); } catch (_) {}
            return;
        }

        try {
            // Build a detailed summary BEFORE we revert
            const lines = [];
            for (const change of (undoChanges || [])) {
                // Get current row
                const row = await guildService.getCharacter(change.character_id);
                const currentXp = Number(row?.xp ?? 0);
                const targetXp = Number(change.xp ?? 0);
                const delta = targetXp - currentXp; // how much we're moving (usually negative of award)
                const sign = delta >= 0 ? "+" : "";
                const displayName = row?.name || `Character #${change.character_index}`;
                lines.push(`• **${displayName}** (#${change.character_index}) — ΔXP: **${sign}${Math.floor(delta)}** \`${Math.floor(currentXp)} → ${Math.floor(targetXp)}\``);
            }

            // Revert all affected characters
            for (const ch of (undoChanges || [])) {
                await guildService.setCharacterXP(ch);
            }
            await updateMemberTierRoles(interaction.guild, guildService, member)
            undone = true;

            const undoAwardEmbed = new EmbedBuilder()
                .setTitle('XP Reward Undone')
                .setDescription(lines.length ? `The previous award has been reverted:\n\n${lines.join("\n")}` : 'The previous award has been reverted.')
                .setFooter({ text: `Support the bot: ${DONATE_URL}` })
                .setColor(XPHOLDER_RETIRE_COLOUR);

            await message.edit({ embeds: [undoAwardEmbed], components: [] }).catch(() => {});
        } catch (err) {
            console.error("[award_xp] Undo failed:", err);
            try {
                await btn.followUp({ content: "Sorry, failed to undo that XP change. Please try again.", ephemeral: true });
            } catch (_) {}
        }
    });

    collector.on('end', async () => {
        if (!undone) {
            try { await message.edit({ components: [] }); } catch (_) {}
        }
    });
}
