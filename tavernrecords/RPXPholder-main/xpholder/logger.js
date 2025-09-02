/**
 * TavernRecords XP Bot - Core Utility
 * Based on code by JTexpo, maintained by Ravenwingz
 * Licensed under MIT with Attribution (see LICENSE and NOTICE)
 */

const { EmbedBuilder } = require('discord.js');
const { DONATE_URL } = require('./config.json');
const fs = require('fs');
const path = require('path');

/**
 * Send a formatted error message to the configured error log channel.
 * 
 * @param {object} guildService - The guild service containing config/settings.
 * @param {Guild} guild - Discord guild object.
 * @param {Error} error - The caught error object.
 * @param {string} context - Optional context string describing where the error occurred.
 */
async function sendGuildErrorLog(guildService, guild, error, context = 'Unknown') {
    try {
        const embed = new EmbedBuilder()
            .setTitle("⚠️ Bot Error")
            .setDescription(`An error occurred during: **${context}**`)
            .addFields({
                name: "Message",
                value: `\`\`\`${(error?.message || 'No error message').substring(0, 1000)}\`\`\``
            })
            .setTimestamp()
            .setColor(0xED4245)
            .setFooter({ text: `Support the bot: ${DONATE_URL}` });

        let sent = false;

        // ✅ Try guild-specific error channel first
        const channelId = guildService.config?.errorLogChannelId;
        if (channelId) {
            const channel = await guild.channels.fetch(channelId).catch(() => null);
            if (channel?.send) {
                await channel.send({ embeds: [embed] });
                sent = true;
            }
        }

        // ✅ Fallback to global error log from cp_config.json
        if (!sent) {
            const configPath = path.join(__dirname, '../cp_config.json');
            let cpConfig;
            try {
                cpConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            } catch (e) {
                console.warn("[logger.js] Failed to read cp_config.json");
            }

            const globalChannelId = cpConfig?.globalErrorLogChannelId;
            if (globalChannelId && guild) {
                const channel = await guild.channels.fetch(globalChannelId).catch(() => null);
                if (channel?.send) {
                    await channel.send({ embeds: [embed] });
                }
            }
        }
    } catch (e) {
        console.error("[sendGuildErrorLog] Failed to log error:", e);
    }
}

module.exports = {
    sendGuildErrorLog
};
