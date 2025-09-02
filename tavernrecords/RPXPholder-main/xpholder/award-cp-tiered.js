/**
 * TavernRecords XP Bot - Core Utility
 * Based on code by JTexpo, maintained by Ravenwingz
 * Licensed under MIT with Attribution (see LICENSE and NOTICE)
 */

const fs = require('fs');
const path = require('path');

// Dummy placeholder for XP calculation - replace with your real function
function getXpNeededForLevel(currentXp, levels) {
    return 1000; // Replace with real logic
}

function awardCPTiered(startingXp, cp, tier, levels) {
    const configPath = path.join(__dirname, 'cp_config.json');
    let config;

    try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (err) {
        console.warn("CP config file missing or invalid. Using default logic.");
        config = null;
    }

    if (
        config &&
        config.useTieredCPPercent &&
        config.cpPercentByTier &&
        config.cpPercentByTier[tier]
    ) {
        const levelXpRequired = getXpNeededForLevel(startingXp, levels);
        const percent = config.cpPercentByTier[tier] / 100;
        const xpAward = cp * percent * levelXpRequired;
        return startingXp + xpAward;
    }

    // Fallback: no XP awarded if config not valid
    return startingXp;
}

module.exports = { awardCPTiered };
