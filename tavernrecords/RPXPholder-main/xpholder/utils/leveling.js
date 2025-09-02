function getLevelInfo(levelObj, xp) {
    for (const [lvl, xpToNext] of Object.entries(levelObj)) {
        xp -= xpToNext;
        if (xp < 0) {
            xp += xpToNext;
            return { level: lvl, levelXp: xp, xpToNext: xpToNext };
        }
    }
    return { level: "20", levelXp: xp, xpToNext: xp };
}

function getTier(level) {
    if (level <= 4) return { tier: 1, nextTier: 2 };
    if (level <= 10) return { tier: 2, nextTier: 3 };
    if (level <= 16) return { tier: 3, nextTier: 4 };
    return { tier: 4, nextTier: 4 };
}

function getXp(wordCount, roleBonus, channelXpPerPost, xpPerPostDivisor, xpPerPostFormula) {
    switch (xpPerPostFormula) {
        case "exponential":
            return (channelXpPerPost + wordCount / xpPerPostDivisor) * (1 + wordCount / xpPerPostDivisor) * roleBonus;
        case "flat":
            return channelXpPerPost * roleBonus;
        case "linear":
            return (channelXpPerPost + wordCount / xpPerPostDivisor) * roleBonus;
        default:
            return 0;
    }
}

function getProgressionBar(xp, xpToNext) {
    let bar = "```|";
    const progress = xp / xpToNext;
    const filled = Math.round(progress * 15);
    const empty = 15 - filled;
    bar += "█".repeat(filled) + "-".repeat(empty);
    bar += `| ${Math.round(progress * 100)}% Complete\`\`\``;
    return bar;
}

module.exports = {
    getLevelInfo,
    getTier,
    getXp,
    getProgressionBar
};
