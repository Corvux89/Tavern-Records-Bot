/**
 * TavernRecords XP Bot - Helper Module
 * Based on code by JTexpo, maintained by Ravenwingz
 * Licensed under MIT with Attribution (see LICENSE and NOTICE)
 */

const { EmbedBuilder } = require('discord.js');
const { getLevelInfo } = require('./levels');
const { getTier } = require('./tiers');
const { getRoleMultiplier } = require('./roles');
const { XPHOLDER_ICON_URL, XPHOLDER_COLOUR } = require('../config.json');

function getActiveCharacterIndex(config, userRoles) {
    for (let i = 1; i <= config.characterCount; i++) {
        if (userRoles.includes(config[`character${i}RoleId`])) {
            return i;
        }
    }
    return 1;
}

function buildCharacterEmbed(guildService, player, character) {
    const levelInfo = getLevelInfo(guildService.levels, character.xp);
    const tierInfo = getTier(parseInt(levelInfo.level));
    const progressBar = getProgressBar(levelInfo.levelXp, levelInfo.xpToNext);
    const roleBonus = getRoleMultiplier(guildService.config.roleBonus, guildService.roles, player._roles);

    const embed = new EmbedBuilder()
        .setTitle(character.name)
        .setThumbnail(character.picture_url && character.picture_url !== "null" ? character.picture_url : XPHOLDER_ICON_URL)
        .setFields(
            { name: "Level", value: `${levelInfo.level}`, inline: true },
            { name: "Role Boost", value: `${roleBonus}`, inline: true },
            { name: "Current Tier", value: `<@&${guildService.config[`tier${tierInfo.tier}RoleId`]}>`, inline: true },
            { name: "Total Character XP", value: `${Math.floor(character.xp)}`, inline: true },
            { name: "Current Level XP", value: `${Math.floor(levelInfo.levelXp)}`, inline: true },
            { name: "Next Level XP", value: `${Math.floor(levelInfo.xpToNext)}`, inline: true },
            { name: "Progress", value: progressBar, inline: false }
        )
        .setFooter({
            text: `Don't like what you see? Try /edit_character (${character.character_index}/${guildService.config.characterCount})`
        })
        .setColor(XPHOLDER_COLOUR);

    if (character.sheet_url) {
        embed.setURL(character.sheet_url);
    }

    return embed;
}

function getProgressBar(current, max) {
    const totalBars = 15;
    const percent = current / max;
    const filled = Math.round(percent * totalBars);
    const empty = totalBars - filled;
    return `\`\`\`|${'█'.repeat(filled)}${'-'.repeat(empty)}| ${Math.round(percent * 100)}% Complete\`\`\``;
}

module.exports = {
    getActiveCharacterIndex,
    buildCharacterEmbed,
    getProgressBar
};
