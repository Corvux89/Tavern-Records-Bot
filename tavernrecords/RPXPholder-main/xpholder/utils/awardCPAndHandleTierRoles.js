const fs = require('fs');
const path = require('path');

const cpConfig = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../cp_config.json'), 'utf8')
);

/**
 * Determine the tier number based on level using cp_config.
 */
function getTierFromLevel(level) {
    if (!cpConfig.customTiersEnabled) return 1;

    for (const [tier, range] of Object.entries(cpConfig.tierLevels)) {
        const [min, max] = range;
        if (level >= min && level <= max) {
            return parseInt(tier);
        }
    }
    return 1;
}

/**
 * Award CP and update tier roles based on level.
 * 
 * @param {*} guildService 
 * @param {*} guild 
 * @param {*} member 
 * @param {number} level 
 */
async function awardCPAndHandleTierRoles(guildService, guild, member, level) {
    const tier = getTierFromLevel(level);
    const percent = cpConfig.cpPercentByTier?.[tier] ?? 0;
    const xpPerCP = cpConfig.defaultXPPerCP || 100;
    const cp = Math.floor((level * xpPerCP) * (percent / 100));

    // Award CP if method exists
    if (typeof guildService.awardCP === 'function') {
        await guildService.awardCP(member.id, cp);
    }

    // Handle Tier Roles
    const allowMultiple = cpConfig.allowMultipleTierRoles ?? true;

    for (let t = 1; t <= 5; t++) {
        const roleId = guildService.config[`tier${t}RoleId`];
        if (!roleId) continue;

        const hasRole = member.roles.cache.has(roleId);

        if (t === tier) {
            if (!hasRole) {
                await member.roles.add(roleId).catch(() => {});
            }
        } else if (!allowMultiple && hasRole) {
            await member.roles.remove(roleId).catch(() => {});
        }
    }
}

module.exports = {
    awardCPAndHandleTierRoles
};
