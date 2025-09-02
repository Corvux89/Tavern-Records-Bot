const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageFlags } = require('discord-api-types/v10');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set_approve_level')
        .setDescription('Set the default starting level for new approvals [OWNER]')
        .addIntegerOption(option =>
            option.setName("level")
                .setDescription("Starting level for new characters (1–20)")
                .setMinValue(1)
                .setMaxValue(20)
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option.setName("public")
                .setDescription("Show this command to everyone?")
                .setRequired(false)
        ),
    async execute(guildService, interaction) {
        const isPublic = interaction.options.getBoolean("public") ?? false;
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral }).catch(() => {});
        }

        if (interaction.user.id !== interaction.guild.ownerId) {
            await interaction.editReply("Sorry, but only the server owner can use this command.");
            return;
        }

        const level = interaction.options.getInteger("level");
        const clamped = Math.max(1, Math.min(20, level));

        try {
            // Upsert both camel + snake so all code paths stay consistent
            await guildService.setConfigKey("approveLevel", String(clamped));
            await guildService.setConfigKey("approve_level", String(clamped));
            await guildService.init(); // reload snapshot
            await interaction.editReply(`Default approve level set to **${clamped}**.`);
        } catch (e) {
            console.error("[set_approve_level] failed:", e);
            await interaction.editReply("I couldn't save that setting. Please try again.");
        }
    }
};
