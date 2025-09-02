const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageFlags } = require('discord-api-types/v10');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('purge_player')
        .setDescription('*WARNING* Deletes all data on a player [OWNER]')
        .addUserOption(option => option
            .setName("player")
            .setDescription("The Player Is Getting Purged")
            .setRequired(true))
        .addBooleanOption(option => option
            .setName("public")
            .setDescription("Show This Command To Everyone?")
            .setRequired(false)
        ),

    async execute(guildService, interaction) {
        // ✅ Defer ASAP
        const isPublic = interaction.options.getBoolean("public") ?? false;
        if (!interaction.deferred && !interaction.replied) {
            try {
                await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral });
            } catch (_) {}
        }

        // Owner gate
        if (interaction.user.id != interaction.guild.ownerId) {
            await interaction.editReply("Sorry, but you are not the owner of the server, and can not use this command.");
            return;
        }

        const player = interaction.options.getUser("player");
        if (!player) {
            await interaction.editReply("I couldn't resolve that user.");
            return;
        }

        try {
            const playerCharacters = await guildService.getAllCharacters(player.id);
            for (const character of (playerCharacters || [])) {
                await guildService.deleteCharacter(character);
            }

            await interaction.editReply(`Success! Purged **${playerCharacters?.length || 0}** character(s) for <@${player.id}>.`);
        } catch (e) {
            console.error("[purge_player] error:", e);
            try {
                await interaction.editReply("Something went wrong while purging that player.");
            } catch (_) {}
        }
    },
};
