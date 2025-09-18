const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageFlags } = require('discord-api-types/v10');
const { sqlInjectionCheck, buildCharacterEmbed } = require("../../utils");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('edit_character')
        .setDescription('Edit your character details')
        .addIntegerOption(option => option
            .setName("character")
            .setDescription("Which character to edit (1 -> 10)")
            .setMinValue(1)
            .setMaxValue(10)
            .setRequired(true))
        .addStringOption(option => option
            .setName("character_name")
            .setDescription("Character name")
            .setRequired(true))
        .addStringOption(option => option
            .setName("sheet_url")
            .setDescription("Link to the character sheet")
            .setRequired(false))
        .addStringOption(option => option
            .setName("picture_url")
            .setDescription("Link to the character picture")
            .setRequired(false))
        // Optional flavor fields
        .addStringOption(option => option
            .setName("class")
            .setDescription("Character class (e.g., Fighter, Wizard)")
            .setRequired(false))
        .addStringOption(option => option
            .setName("race")
            .setDescription("Character race or species")
            .setRequired(false))
        .addStringOption(option => option
            .setName("background")
            .setDescription("Character background")
            .setRequired(false))
        .addStringOption(option => option
            .setName("alignment")
            .setDescription("Character alignment (e.g., CG, LN)")
            .setRequired(false))
        // per-character ping toggle
        .addBooleanOption(option => option
            .setName("ping_on_award")
            .setDescription("Ping me when XP/CP is awarded to this character?")
            .setRequired(false))
        .addBooleanOption(option => option
            .setName("public")
            .setDescription("Show this command to everyone?")
            .setRequired(false)),

    async execute(guildService, interaction) {
        // Belt & suspenders: main.js defers, but we also defer if needed
        const isPublic = interaction.options.getBoolean("public") ?? false;
        if (!interaction.deferred && !interaction.replied) {
            try {
                await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral });
            } catch (_) {}
        }

        const characterNumber = interaction.options.getInteger("character");
        const name = interaction.options.getString("character_name");
        const sheetUrl = interaction.options.getString("sheet_url");
        const pictureUrl = interaction.options.getString("picture_url");

        // Optional flavor inputs
        const charClass = interaction.options.getString("class");
        const race = interaction.options.getString("race");
        const background = interaction.options.getString("background");
        const alignment = interaction.options.getString("alignment");

        // Optional ping toggle
        const pingOnAwardOpt = interaction.options.getBoolean("ping_on_award");

        const guild = interaction.member.guild;
        const user = interaction.user;

        // Only allow users to edit their own characters
        const player = await guild.members.fetch(user.id).catch(() => null);
        if (!player) {
            await interaction.editReply("I couldn't fetch your member record. Are you still in the server?");
            return;
        }

        const characterId = `${player.id}-${characterNumber}`;
        const character = await guildService.getCharacter(characterId);
        if (!character) {
            await interaction.editReply("Sorry, but that character does not exist.");
            return;
        }

        // --- Validate links & name ---
        const whitelist = [
            "https://ddb.ac/characters/",
            "https://dicecloud.com/character/",
            "https://www.dndbeyond.com/profile/",
            "https://www.dndbeyond.com/characters/",
            "https://docs.google.com/spreadsheets/"
        ];

        let characterSheet = character.sheet_url || "";
        if (typeof sheetUrl === "string") {
            const ok = whitelist.some(prefix => sheetUrl.startsWith(prefix));
            characterSheet = ok && !sqlInjectionCheck(sheetUrl) ? sheetUrl : "";
        }

        let characterUrl = character.picture_url ?? null;
        if (typeof pictureUrl === "string") {
            characterUrl = (!sqlInjectionCheck(pictureUrl) && pictureUrl.startsWith("https")) ? pictureUrl : null;
        }

        // Name: sanitize & clamp to 100 chars
        let characterName = sqlInjectionCheck(name) ? "Character" : String(name).trim();
        if (characterName.length > 100) characterName = characterName.slice(0, 100);

        // sanitize simple text fields (max 100 chars)
        const clean = (s) => {
            if (!s && s !== "") return null;
            if (typeof s !== "string") return null;
            if (sqlInjectionCheck(s)) return null;
            return s.trim().slice(0, 100);
        };

        // Build updated payload (preserve existing values if options omitted)
        const updatedCharacter = {
            character_id: characterId,
            character_index: Number(characterNumber),
            name: characterName,
            sheet_url: characterSheet,         // empty string allowed to clear
            picture_url: characterUrl,         // null allowed to clear
            player_id: player.id,
            xp: character.xp,

            class:      charClass !== null ? clean(charClass)      : (character.class ?? null),
            race:       race !== null ? clean(race)                : (character.race ?? null),
            background: background !== null ? clean(background)    : (character.background ?? null),
            alignment:  alignment !== null ? clean(alignment)      : (character.alignment ?? null),
        };

        // Persist main fields
        try {
            await guildService.updateCharacterInfo(updatedCharacter);
        } catch (e) {
            console.error("[edit_character] updateCharacterInfo failed:", e);
            await interaction.editReply("I couldn't update that character. Please try again.");
            return;
        }

        // Persist ping flag if the user provided it
        let pingStateText = null;
        if (typeof pingOnAwardOpt === "boolean") {
            try {
                await guildService.setCharacterPing(characterId, pingOnAwardOpt);
                pingStateText = `Ping on award: **${pingOnAwardOpt ? "On" : "Off"}**`;
            } catch (e) {
                console.error("[edit_character] setCharacterPing failed:", e);
                pingStateText = "Ping on award: **(unchanged due to an error)**";
            }
        }

        // Rebuild the embed using the merged data
        const embed = await buildCharacterEmbed(
            guildService,
            guild,
            player,
            { ...character, ...updatedCharacter },
            characterNumber
        );

        if (pingStateText) {
            const prev = embed.data?.description || "";
            const join = prev ? `\n\n${pingStateText}` : pingStateText;
            embed.setDescription(`${prev}${join}`);
        }

        await interaction.editReply({ embeds: [embed] });
    }
};
