const { SlashCommandBuilder } = require('@discordjs/builders')

module.exports = {
    data: new SlashCommandBuilder()
        .setName('edit_tiers')
        .setDescription('Changes Tier information in the SErver Database! [ OWNER ]')

        .addIntegerOption(option => option
            .setName("tier")
            .setDescription("A Tier to be edited")
            .setMinValue(1)
            .setMaxValue(5)
            .setRequired(true)
        )

        .addIntegerOption(option => option
            .setName("minimum_level")
            .setDescription("Minimum level for the tier")
            .setMinValue(0)
            .setRequired(false)
        )

        .addIntegerOption(option => option
            .setName("maximum_level")
            .setDescription("Maximum level for the tier")
            .setMinValue(0)
            .setRequired(false)
        )

        .addNumberOption(option => option 
            .setName("cp_percentage")
            .setDescription("Percentage of xp a CP should reward")
            .setMinValue(0)
            .setRequired(false)
        )
    ,
    async execute(guildService, interaction){
        if (!guildService.isOwner(interaction)) {
            await interaction.editReply("Sorry, but you are not the owner of the server, and can not use this command")
            return
        }

        const tier = interaction.options.getInteger('tier')
        const oldTierData = guildService.tiers[tier]

        if (!oldTierData) {
            await interaction.editReply("Sorry, but we can't find that tier's information.")
            return
        }


        const min_level = interaction.options.getInteger('minimum_level') || oldTierData.min_level
        const max_level = interaction.options.getInteger('maximum_level') || oldTierData.max_level
        const cp_percent = interaction.options.getNumber('cp_percentage') || oldTierData.cp_percent

        await guildService.updateTier(tier, min_level, max_level, cp_percent)

        await interaction.editReply("Success!")
    }
}