const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');

// Target palette (must match register.js + embed visuals)
const PALETTE = {
    tier1RoleId: { name: 'Tier 1', rgb: [59, 130, 246], hex: '#3B82F6' },   // 🟦
    tier2RoleId: { name: 'Tier 2', rgb: [139, 92, 246], hex: '#8B5CF6' },   // 🟪
    tier3RoleId: { name: 'Tier 3', rgb: [34, 197, 94], hex: '#22C55E' },    // 🟩
    tier4RoleId: { name: 'Tier 4', rgb: [250, 204, 21], hex: '#FACC15' },   // 🟨
    xpFreezeRoleId: { name: 'XP Freeze', rgb: [165, 243, 252], hex: '#A5F3FC' }, // distinct pastel cyan
    xpShareRoleId:  { name: 'XP Share',  rgb: [236, 72, 153],  hex: '#EC4899' }, // vivid magenta
};

// Helper: convert [r,g,b] to integer 0xRRGGBB
const rgbToInt = ([r, g, b]) => ((r & 255) << 16) + ((g & 255) << 8) + (b & 255);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sync_role_colors')
        .setDescription('Owner: sync tier/XP roles to the standard color palette')
        .addBooleanOption(option =>
            option.setName('public')
                .setDescription('Show this command to everyone?')
                .setRequired(false)
        ),

    async execute(guildService, interaction) {
        // Owner gate
        if (!guildService.isOwner(interaction)) {
            await interaction.editReply('Sorry, only the **server owner** can use this command.');
            return;
        }

        const guild = interaction.guild;
        const results = [];
        const errors = [];

        // Ensure we have a config to read IDs from
        if (!guildService?.config) {
            await interaction.editReply('No guild config found. Did you run `/register`?');
            return;
        }

        // For each known role key in the palette, try to update color
        for (const [configKey, meta] of Object.entries(PALETTE)) {
            const roleId = guildService.config[configKey];
            if (!roleId) {
                results.push(`- ${meta.name}: *(no role id in config)*`);
                continue;
            }

            try {
                const role = await guild.roles.fetch(roleId).catch(() => null);
                if (!role) {
                    results.push(`- ${meta.name}: *(role not found)*`);
                    continue;
                }

                // Only update if different
                const targetInt = rgbToInt(meta.rgb);
                if (role.color !== targetInt) {
                    await role.setColor(targetInt, 'Sync role color to Tavern Records palette');
                    results.push(`- ${meta.name}: updated to \`${meta.hex}\``);
                } else {
                    results.push(`- ${meta.name}: already \`${meta.hex}\``);
                }
            } catch (e) {
                console.error(`[sync_role_colors] Failed for ${meta.name}:`, e);
                errors.push(`- ${meta.name}: error (${e?.message || 'unknown'})`);
            }
        }

        const embed = new EmbedBuilder()
            .setTitle('Role Color Sync')
            .setDescription('Applied the Tavern Records color palette to tier roles + XP Freeze/Share.')
            .addFields(
                { name: 'Results', value: results.join('\n') || 'No roles processed.', inline: false },
                ...(errors.length ? [{ name: 'Errors', value: errors.join('\n'), inline: false }] : [])
            )
            .setColor(0x3B82F6); // Friendly blue

        await interaction.editReply({ embeds: [embed] });
    }
};
