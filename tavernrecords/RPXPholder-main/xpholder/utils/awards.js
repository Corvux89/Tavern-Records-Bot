/**
 * TavernRecords XP Bot - Helper Module
 * Based on code by JTexpo, maintained by Ravenwingz
 * Licensed under MIT with Attribution (see LICENSE and NOTICE)
 */

const { getLevelInfo } = require('./leveling');

function awardCP(xp, cp, levels) {
    const levelInfo = getLevelInfo(levels, xp);
    if (parseInt(levelInfo["level"]) < 4) {
        return xp + (cp * (levelInfo["xpToNext"] / 4));
    }
    return xp + (cp * (levelInfo["xpToNext"] / 8));
}

function awardCXPs(startingXp, cxp, levels) {
    for (; cxp > 0; cxp--) {
        startingXp += awardCP(startingXp, 1, levels);
    }
    return startingXp;
}

module.exports = { awardCP, awardCXPs };
