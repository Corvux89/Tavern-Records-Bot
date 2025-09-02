/**
 * TavernRecords XP Bot - Core Utility
 * Based on code by JTexpo, maintained by Ravenwingz
 * Licensed under MIT with Attribution (see LICENSE and NOTICE)
 */

function getRoleMultiplier(roleBonus, collectionOfGuildRoles, listOfPlayerRoles) {
    let roleMultiplier = 1;

    switch (roleBonus) {
        case "highest":
            for (const roleId of listOfPlayerRoles) {
                if (!(roleId in collectionOfGuildRoles)) continue;

                const bonus = collectionOfGuildRoles[roleId];
                if (bonus > roleMultiplier) {
                    roleMultiplier = bonus;
                } else if (bonus === 0) {
                    roleMultiplier = 0;
                    break;
                }
            }
            break;

        case "sum":
            for (const roleId of listOfPlayerRoles) {
                if (!(roleId in collectionOfGuildRoles)) continue;

                const bonus = collectionOfGuildRoles[roleId];
                if (bonus === 0) {
                    roleMultiplier = 0;
                    break;
                }
                roleMultiplier += bonus;
            }
            break;
    }

    return roleMultiplier;
}

function getTier(level) {
    if (level <= 4) return { tier: 1, nextTier: 2 };
    if (level <= 10) return { tier: 2, nextTier: 3 };
    if (level <= 16) return { tier: 3, nextTier: 4 };
    return { tier: 4, nextTier: 4 };
}

function getActiveCharacterIndex(serverConfig, userRoles) {
    for (let characterId = 1; characterId <= serverConfig["characterCount"]; characterId++) {
        if (userRoles.includes(serverConfig[`character${characterId}RoleId`])) {
            return characterId;
        }
    }
    return 1;
}

module.exports = {
    getRoleMultiplier,
    getTier,
    getActiveCharacterIndex
};
