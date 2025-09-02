/**
 * TavernRecords XP Bot - Helper Module
 * Based on code by JTexpo, maintained by Ravenwingz
 * Licensed under MIT with Attribution (see LICENSE and NOTICE)
 */

const { getLevelInfo } = require('./leveling');
const { awardCPTiered } = require('./award-cp-tiered');

// ✅ Now uses tiered % logic
function awardCP(xp, cp, levels, tier = 1) {
    return awardCPTiered(xp, cp, tier, levels);
}

// ✅ Also uses tiered % logic
function awardCXPs(startingXp, cxp, levels, tier = 1) {
    return awardCPTiered(startingXp, cxp, tier, levels);
}

module.exports = { awardCP, awardCXPs };
