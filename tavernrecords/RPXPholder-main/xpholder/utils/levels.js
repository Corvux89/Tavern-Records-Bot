/**
 * TavernRecords XP Bot - Core Utility
 * Based on code by JTexpo, maintained by Ravenwingz
 * Licensed under MIT with Attribution (see LICENSE and NOTICE)
 */

function getLevelInfo(levels, xp) {
    for (const [level, xpToNext] of Object.entries(levels)) {
        xp -= xpToNext;
        if (xp < 0) {
            xp += xpToNext;
            return { level, levelXp: xp, xpToNext };
        }
    }

    // Max level fallback
    return {
        level: "20",
        levelXp: xp,
        xpToNext: xp
    };
}

function awardCP(xp, levels) {
    const levelInfo = getLevelInfo(levels, xp);
    return parseInt(levelInfo.level) < 4
        ? levelInfo.xpToNext / 4
        : levelInfo.xpToNext / 8;
}

function awardCPs(startingXp, cpCount, levels) {
    for (; cpCount > 0; cpCount--) {
        startingXp += awardCP(startingXp, levels);
    }
    return startingXp;
}

function getXp(wordCount, roleBonus, channelXpPerPost, xpPerPostDivisor, xpPerPostFormula) {
    switch (xpPerPostFormula) {
        case "exponential":
            return (channelXpPerPost + wordCount / xpPerPostDivisor) * (1 + wordCount / xpPerPostDivisor) * roleBonus;
        case "flat":
            return channelXpPerPost * roleBonus;
        case "linear":
            return (channelXpPerPost + wordCount / xpPerPostDivisor) * roleBonus;
    }
    return 0;
}

function getProgressionBar(xp, xpToNext) {
    const progress = xp / xpToNext;
    let progressBar = "```|";
    progressBar += "█".repeat(Math.round(progress * 15));
    progressBar += "-".repeat(Math.round((1 - progress) * 15));
    progressBar += `| ${Math.round(progress * 100)}% Complete\`\`\``;
    return progressBar;
}

module.exports = {
    getLevelInfo,
    awardCP,
    awardCPs,
    getXp,
    getProgressionBar
};
