const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');
const { MessageFlags } = require('discord-api-types/v10');

const {
    XPHOLDER_COLOUR,
    XPHOLDER_ICON_URL,
    DONATE_URL,
    DEV_SERVER_URL,
    LEVELS              // ✅ fallback XP curve
} = require("../../config.json");

const { buildCharacterEmbed } = require("../../utils/embedBuilder");
const {
    sqlInjectionCheck,
    logSuccess,
    safeChannelSend,
    getLevelInfo,
    getTier
} = require("../../utils");

// Tavern Records logo (used in approval DM + announcement)
const TAVERN_RECORDS_ICON = "https://cdn.discordapp.com/attachments/1403510335104618568/1404208777569243176/Tavern_Records.png?ex=68a2ec95&is=68a19b15&hm=2ed3d77dd3e7265eac5206400dca6af32a13ef758019086b3c2a913b2e9b8026&";

/** Sum xp_to_next for levels < targetLevel. */
function sumXpToReachLevel(levelsMap, targetLevelRaw) {
    const targetLevel = Math.max(1, parseInt(targetLevelRaw, 10) || 1);
    const map = (levelsMap && Object.keys(levelsMap).length > 0) ? levelsMap : (LEVELS || {});
    if (!map || typeof map !== 'object') return 0;

    const entries = Object.entries(map)
        .map(([lvl, xp]) => [parseInt(lvl, 10), Number(xp) || 0])
        .filter(([lvl]) => Number.isInteger(lvl))
        .sort((a, b) => a[0] - b[0]);

    let total = 0;
    for (const [lvl, xpToNext] of entries) {
        if (lvl >= targetLevel) break;
        total += xpToNext;
    }
    return total;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('approve_player')
        .setDescription('Approves A Player Character [ MOD ]')
        .addUserOption(option =>
            option.setName("player")
                .setDescription("The Player You Want To Approve")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName("character")
                .setDescription("Which Character You Want To Approve (1 → 10)")
                .setMinValue(1)
                .setMaxValue(10)
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("character_name")
                .setDescription("Name Of The Character")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("sheet_url")
                .setDescription("A Link To Their Character Sheet")
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName("picture_url")
                .setDescription("A Link To The Character Picture")
                .setRequired(false)
        )
        // Optional flavor fields
        .addStringOption(option =>
            option.setName("class")
                .setDescription("Character class (e.g., Fighter, Wizard)")
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName("race")
                .setDescription("Character race or species")
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName("background")
                .setDescription("Character background")
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName("alignment")
                .setDescription("Character alignment (e.g., CG, LN)")
                .setRequired(false)
        )
        // Optional per-approval override
        .addIntegerOption(option =>
            option.setName("start_level")
                .setDescription("Override the server default start level (1–20)")
                .setMinValue(1)
                .setMaxValue(20)
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName("public")
                .setDescription("Show This Command To Everyone?")
                .setRequired(false)
        ),

    async execute(guildService, interaction) {
        // Defer ASAP
        const isPublic = interaction.options.getBoolean("public") ?? false;
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral }).catch(() => {});
        }

        // Permission check
        if (!guildService.isMod(interaction.member._roles) &&
            interaction.user.id !== interaction.guild.ownerId) {
            await interaction.editReply("Sorry, you do not have the right role to use this command.");
            return;
        }

        const guild = interaction.member.guild;

        const user = interaction.options.getUser("player");
        const characterNumber = interaction.options.getInteger("character");
        const name = interaction.options.getString("character_name");
        const sheetUrl = interaction.options.getString("sheet_url");
        const pictureUrl = interaction.options.getString("picture_url");

        // Flavor fields
        const charClass = interaction.options.getString("class");
        const race = interaction.options.getString("race");
        const background = interaction.options.getString("background");
        const alignment = interaction.options.getString("alignment");

        // Optional per-approval override
        const startLevelOpt = interaction.options.getInteger("start_level");

        const player = await guild.members.fetch(user.id).catch(() => null);
        if (!player) {
            await interaction.editReply("I couldn't fetch that member. Are they still in the server?");
            return;
        }
        const hasCharacter = await guildService.getCharacter(`${player.id}-${characterNumber}`);

        // Validation
        const configuredCount = Number(guildService.config?.characterCount) || 1;
        if (characterNumber > configuredCount) {
            await interaction.editReply(
                `Sorry, this server is configured for ${configuredCount} character(s). To change, please use \`/register\` again.`
            );
            return;
        }
        if (hasCharacter) {
            await interaction.editReply("Sorry, but that character exists. Please retire first.");
            return;
        }

        // Validate/sanitize inputs
        let characterSheet = "";
        if (
            sheetUrl &&
            (
                sheetUrl.startsWith("https://ddb.ac/characters/") ||
                sheetUrl.startsWith("https://dicecloud.com/character/") ||
                sheetUrl.startsWith("https://www.dndbeyond.com/profile/") ||
                sheetUrl.startsWith("https://www.dndbeyond.com/characters/") ||
                sheetUrl.startsWith("https://docs.google.com/spreadsheets/")
            ) &&
            !sqlInjectionCheck(sheetUrl)
        ) {
            characterSheet = sheetUrl;
        }

        let characterUrl = "";
        if (pictureUrl && !sqlInjectionCheck(pictureUrl)) {
            characterUrl = pictureUrl.startsWith("https") ? pictureUrl : "";
        }

        const characterName = sqlInjectionCheck(name) ? "Character" : name;

        // Clean flavor fields
        const clean = (s) => {
            if (!s) return null;
            if (sqlInjectionCheck(s)) return null;
            return String(s).trim().slice(0, 100);
        };

        // Determine starting level (override → config → 1)
        let approveLevel = 1;
        if (Number.isInteger(startLevelOpt)) {
            approveLevel = Math.max(1, Math.min(20, startLevelOpt));
        } else {
            try {
                if (typeof guildService.getApproveLevel === "function") {
                    approveLevel = guildService.getApproveLevel();
                } else {
                    const raw = guildService.config?.approveLevel ?? guildService.config?.approve_level ?? 1;
                    const n = parseInt(raw, 10);
                    approveLevel = Math.max(1, Math.min(20, Number.isFinite(n) ? n : 1));
                }
            } catch (_) {
                approveLevel = 1;
            }
        }

        // Compute starting XP for that level (fallback to config LEVELS if DB empty)
        const xp = sumXpToReachLevel(guildService.levels, approveLevel);

        // New character object
        const character = {
            character_id: `${player.id}-${characterNumber}`,
            character_index: characterNumber,
            name: characterName,
            sheet_url: characterSheet,
            picture_url: characterUrl || player.user?.avatarURL() || XPHOLDER_ICON_URL,
            player_id: player.id,
            xp,
            class: clean(charClass),
            race: clean(race),
            background: clean(background),
            alignment: clean(alignment),
        };

        // Insert & persist
        try {
            await guildService.insertCharacter(character);
        } catch (e) {
            console.error("[approve_player] insertCharacter failed:", e);
            await interaction.editReply("I couldn't save that character to the database. Please try again.");
            return;
        }

        if (character.class || character.race || character.background || character.alignment) {
            try { await guildService.updateCharacterInfo(character); } catch (_) {}
        }

        // ---- Assign roles immediately on approval (character + tier) ----
        try {
            const levelInfo = getLevelInfo(guildService.levels, character.xp);
            const tierInfo = getTier(levelInfo.level);

            const removeRoles = [];
            const addRoles = [];

            // Remove other character roles
            const characterCount = Number(guildService.config?.characterCount) || 1;
            for (let idx = 1; idx <= characterCount; idx++) {
                if (idx !== character.character_index) {
                    const rid = guildService.config[`character${idx}RoleId`];
                    if (rid) {
                        const r = await guild.roles.fetch(rid).catch(() => null);
                        if (r) removeRoles.push(r);
                    }
                }
            }

            // Add this character role
            {
                const rid = guildService.config[`character${character.character_index}RoleId`];
                if (rid) {
                    const r = await guild.roles.fetch(rid).catch(() => null);
                    if (r) addRoles.push(r);
                }
            }

            // Remove other tier roles
            for (let t = 1; t <= 4; t++) {
                if (t !== tierInfo.tier) {
                    const rid = guildService.config[`tier${t}RoleId`];
                    if (rid) {
                        const r = await guild.roles.fetch(rid).catch(() => null);
                        if (r) removeRoles.push(r);
                    }
                }
            }

            // Add current tier role
            {
                const rid = guildService.config[`tier${tierInfo.tier}RoleId`];
                if (rid) {
                    const r = await guild.roles.fetch(rid).catch(() => null);
                    if (r) addRoles.push(r);
                }
            }

            const cleanRemoves = removeRoles.filter(Boolean);
            const cleanAdds = addRoles.filter(Boolean);

            if (cleanRemoves.length) await player.roles.remove(cleanRemoves).catch(() => {});
            if (cleanAdds.length)    await player.roles.add(cleanAdds).catch(() => {});
        } catch (e) {
            console.warn("[approve_player] Failed to assign roles on approval:", e?.message);
        }
        // -----------------------------------------------------------------

        // Welcome/approval embed (DM + announce)
        const approveEmbed = new EmbedBuilder()
            .setTitle(`Welcome To ${guild.name}`)
            .setDescription(guildService.config?.approveMessage || "Congratulations, your character is approved!")
            .setURL(DONATE_URL)
            .setColor(XPHOLDER_COLOUR)
            .setThumbnail(TAVERN_RECORDS_ICON);

        const banner = guild.bannerURL?.({ size: 1024 });
        if (banner) approveEmbed.setImage(banner);

        approveEmbed.addFields({
            name: "Links",
            value: `[Ko-fi](${DONATE_URL}) • [Dev Server](${DEV_SERVER_URL})`,
            inline: false
        });

        // Character card (server-facing)
        let characterEmbed = await buildCharacterEmbed(guildService, guild, player, character);

        // DM the player
        try {
            await player.send({ embeds: [approveEmbed] });
            characterEmbed.setDescription(`<@${player.id}> has been successfully notified!`);
        } catch (error) {
            characterEmbed.setDescription(`<@${player.id}> approved, but was unable to be notified via DM.`);
            console.log(error);
        }

        // Show to the moderator who ran the command
        await interaction.editReply({ embeds: [characterEmbed] });

        // 🔔 Announce in level-up channel (include the welcome + character card)
        try {
            const levelUpChannelId = guildService.config["levelUpChannelId"];
            if (levelUpChannelId) {
                const channel = await guild.channels.fetch(levelUpChannelId).catch(() => null);
                if (channel) {
                    await safeChannelSend(channel, { embeds: [approveEmbed, characterEmbed] }, interaction);
                }
            }
        } catch (e) {
            console.warn("[approve_player] Announcement failed:", e?.message);
        }

        // ✅ Log success
        try {
            await logSuccess(interaction, `Approved character ${character.name}`, [
                { name: "Player", value: `<@${player.id}>`, inline: true },
                { name: "Index", value: `${character.character_index}`, inline: true },
                { name: "Approve Level", value: `${approveLevel}`, inline: true },
                { name: "Start XP", value: `${character.xp}`, inline: true }
            ]);
        } catch (_) { /* non-fatal */ }
    }
};
