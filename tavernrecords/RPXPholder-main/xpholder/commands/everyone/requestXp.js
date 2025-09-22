const { SlashCommandBuilder } = require('@discordjs/builders');
const { ActionRowBuilder, ButtonBuilder, EmbedBuilder, ButtonStyle } = require('discord.js');

const {
    XPHOLDER_COLOUR,
    XPHOLDER_ICON_URL,
    DEV_SERVER_URL,
    XPHOLDER_LEVEL_UP_COLOUR,
    XPHOLDER_RETIRE_COLOUR,
    XPHOLDER_APPROVE_COLOUR,
    DONATE_URL
} = require("../../config.json");

const { getLevelInfo, awardCP, logSuccess, safeChannelSend, updateMemberTierRoles, getTierInfo, getTierVisuals } = require("../../utils");

// Local helper – emoji progress bar
function getEmojiProgressBar(currentXP, neededXP, barLength = 10, emoji = '🟦') {
    if (!neededXP || neededXP <= 0 || isNaN(currentXP) || isNaN(neededXP)) {
        return `⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛ 0%`;
    }
    const percent = Math.min(currentXP / neededXP, 1);
    const filled = Math.round(barLength * percent);
    const empty = barLength - filled;
    return `${emoji.repeat(filled)}${'⬛'.repeat(empty)} ${Math.floor(percent * 100)}%`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('request_xp')
        .setDescription('Request XP / CP changes for your character')
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
                { name: "Get XP", value: "give_xp" },
                { name: "Set CP", value: "set_cp" },
                { name: "Get CP", value: "give_cp" }
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
        /*
        --------------
        INITIALIZATIONS
        --------------
        */
        const characterId = interaction.options.getInteger("character");
        const awardType = interaction.options.getString("award_type");
        const value = interaction.options.getInteger("value");
        let memo = interaction.options.getString("memo") || `Command Requested In <#${interaction.channelId}>`;

        const guild = interaction.member.guild;
        const user = interaction.user;
        const player = await guild.members.fetch(user.id);

        let character = await guildService.getCharacter(`${player.id}-${characterId}`);
        let awardChannel;

        /*
        -------------
        VALIDATION
        -------------
        */
        try {
            awardChannel = await guild.channels.fetch(guildService.config["levelUpChannelId"]);
        } catch (error) {
            await interaction.editReply(`Sorry, but I can't find the **level_up_channel**.\nPlease contact ${guildService.mentionOwner(interaction)} and ask them to set a new **level_up_channel** with : \`/edit_config\``);
            return;
        }

        if (!character) {
            await interaction.editReply("Sorry, but that character does not exist");
            return;
        }

        const oldXp = Number(character["xp"]) || 0;
        const oldLevelInfo = getLevelInfo(guildService.levels, oldXp);

        /*
        ------------
        XP ALGORITHM
        ------------
        */
        switch (awardType) {
            case "set_level": {
                let newXp = 0;
                for (const [level, xpToNext] of Object.entries(guildService.levels)) {
                    if (parseInt(level) < value) newXp += xpToNext;
                }
                character["xp"] = newXp;
                break;
            }
            case "set_xp":
                character["xp"] = value;
                break;
            case "give_xp":
                character["xp"] = oldXp + value;
                break;
            case "set_cp":
                character["xp"] = awardCP(guildService, 0, value);
                break;
            case "give_cp":
                character["xp"] = awardCP(guildService, oldXp, value);
                break;
        }

        /*
        -------------
        AWARD XP POST
        -------------
        */
        const newXp = Number(character["xp"]) || 0;
        const newLevelInfo = getLevelInfo(guildService.levels, newXp);

        // Tier-colored visuals
        const tierInfo = getTierInfo(guildService.tiers, parseInt(newLevelInfo.level));
        const { emoji } = await getTierVisuals(guild, guildService.config[`tier${tierInfo.tier}RoleId`]);
        const progressBar = getEmojiProgressBar(newLevelInfo["levelXp"], newLevelInfo["xpToNext"], 10, emoji);

        // Build embed
        let awardEmbed = new EmbedBuilder()
            .setURL(DONATE_URL)
            .setThumbnail((character["picture_url"] && character["picture_url"] !== "null") ? character["picture_url"] : XPHOLDER_ICON_URL)
            .setFooter({ text: `Support the bot: ${DONATE_URL}` })
            .setDescription(String(memo || ""));

        let levelFieldName = "Level";
        let levelFieldValue = String(newLevelInfo["level"]);

        if (oldLevelInfo["level"] != newLevelInfo["level"]) {
            levelFieldName = "Level Up!";
            levelFieldValue = `${oldLevelInfo["level"]} → **${newLevelInfo["level"]}**`;
            awardEmbed.setColor(XPHOLDER_LEVEL_UP_COLOUR);
        } else {
            awardEmbed.setColor(XPHOLDER_COLOUR);
        }

        switch (awardType) {
            case "set_level":
                awardEmbed.setTitle(`${character["name"]}'s Level Request`)
                    .setFields(
                        { inline: true, name: "Level", value: String(newLevelInfo["level"]) },
                        { inline: true, name: "Requested By", value: `${interaction.user}` },
                        { inline: false, name: "Progress", value: progressBar },
                    );
                break;

            case "set_xp":
                awardEmbed.setTitle(`${character["name"]}'s XP Set Request`)
                    .setFields(
                        { inline: true, name: "Level", value: String(newLevelInfo["level"]) },
                        { inline: true, name: "Total XP", value: `${Math.floor(newXp)}` },
                        { inline: true, name: "Requested By", value: `${interaction.user}` },
                        { inline: false, name: "Progress", value: progressBar },
                    );
                break;

            case "give_xp":
                awardEmbed.setTitle(`${character["name"]}'s XP Request`)
                    .setFields(
                        { inline: true, name: levelFieldName, value: levelFieldValue },
                        { inline: true, name: "XP Received", value: `${value}` },
                        { inline: true, name: "Requested By", value: `${interaction.user}` },
                        { inline: false, name: "Progress", value: progressBar },
                    );
                break;

            case "set_cp":
                awardEmbed.setTitle(`${character["name"]}'s CP Set Request`)
                    .setFields(
                        { inline: true, name: "Level", value: String(newLevelInfo["level"]) },
                        { inline: true, name: "Total CP", value: `${value}` },
                        { inline: true, name: "Requested By", value: `${interaction.user}` },
                        { inline: false, name: "Progress", value: progressBar },
                    );
                break;

            case "give_cp":
                awardEmbed.setTitle(`${character["name"]}'s CP Request`)
                    .setFields(
                        { inline: true, name: levelFieldName, value: levelFieldValue },
                        { inline: true, name: "CP Received", value: `${value}` },
                        { inline: true, name: "Requested By", value: `${interaction.user}` },
                        { inline: false, name: "Progress", value: progressBar },
                    );
                break;
        }

        /*
        ---------------
        POSTING REQUEST
        ---------------
        */
        const modRoleId = guildService.config["moderationRoleId"];
        const pingModsContent = modRoleId ? `<@&${modRoleId}>` : undefined;
        const pingModsAllowed = modRoleId ? { roles: [modRoleId] } : undefined;

        if (guildService.config["allowPlayerManageXp"] == "on") {
            // Auto-approve path: post (ping mods) & apply immediately
            await safeChannelSend(
                awardChannel,
                {
                    content: pingModsContent,
                    allowedMentions: pingModsAllowed,
                    embeds: [awardEmbed]
                },
                interaction
            );

            const characterSchema = {
                "character_id": character["character_id"],
                "character_index": character["character_index"],
                "player_id": character["player_id"],
                "xp": character["xp"],
            };

            await guildService.setCharacterXP(characterSchema);

            // ✅ success log (auto-approved)
            await logSuccess(interaction, `Auto-approved ${awardType} request for ${character.name}`, [
                { name: "Player", value: `${player}`, inline: true },
                { name: "Character", value: `${character.name} (#${character.character_index})`, inline: true },
                { name: "New XP", value: `${Math.floor(character.xp)}`, inline: true }
            ]);

            await interaction.editReply("Success!");
        } else {
            // Moderation review path
            const requestButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('request_approve')
                        .setLabel('Approve')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId("request_reject")
                        .setLabel("Reject")
                        .setStyle(ButtonStyle.Danger)
                );

            const requestMessage = await safeChannelSend(
                awardChannel,
                {
                    content: pingModsContent,
                    allowedMentions: pingModsAllowed,
                    embeds: [awardEmbed],
                    components: [requestButtons]
                },
                interaction
            );

            createButtonEvents(guildService, requestMessage, character, (newXp - oldXp), awardChannel, awardEmbed, player);
            await interaction.editReply("Success!");
        }
    },
};

function createButtonEvents(guildService, requestMessage, character, deltaXp, collectorChannel, awardEmbed, player) {
    // Only mods/owner can act on the request
    const filter = btnInteraction => (
        ['request_approve', 'request_reject'].includes(btnInteraction.customId) &&
        requestMessage?.id === btnInteraction.message.id && guildService.isModerator(btnInteraction)
    );

    if (!collectorChannel || !requestMessage) return;

    // ⏳ keep within Discord's realistic interaction window (~15m)
    const collector = collectorChannel.createMessageComponentCollector({ filter, time: 15 * 60 * 1000 });

    collector.on('collect', async btnInteraction => {
        try {
            switch (btnInteraction.customId) {
                case "request_approve":
                    awardEmbed.addFields({ inline: false, name: "Approved By", value: `${btnInteraction.user}` });
                    awardEmbed.setColor(XPHOLDER_APPROVE_COLOUR);

                    await guildService.updateCharacterXP(character, deltaXp);
                    await updateMemberTierRoles(btnInteraction.guild, guildService, player)

                    await btnInteraction.update({ embeds: [awardEmbed], components: [] });
                    await player.send({ embeds: [awardEmbed] }).catch(() => {});
                    await logSuccess(btnInteraction, `Request approved for ${character.name}`, [
                        { name: "Player", value: `<@${player.id}>`, inline: true },
                        { name: "Delta XP", value: `${deltaXp}`, inline: true }
                    ]);
                    break;

                case "request_reject":
                    awardEmbed.addFields({ inline: false, name: "Rejected By", value: `${btnInteraction.user}` });
                    awardEmbed.setColor(XPHOLDER_RETIRE_COLOUR);

                    await btnInteraction.update({ embeds: [awardEmbed], components: [] });
                    await player.send({ embeds: [awardEmbed] }).catch(() => {});
                    await logSuccess(btnInteraction, `Request rejected for ${character.name}`, [
                        { name: "Player", value: `<@${player.id}>`, inline: true }
                    ]);
                    break;
            }
            return;
        } catch (error) {
            console.log(error);
        }
    });

    // 🧹 disable buttons when collector ends
    collector.on('end', async () => {
        try { await requestMessage.edit({ components: [] }); } catch (_) {}
    });
}
