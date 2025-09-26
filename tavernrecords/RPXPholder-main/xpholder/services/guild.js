/**
 * TavernRecords XP Bot - Core Utility
 * Based on code by JTexpo, maintained by Ravenwingz
 * Licensed under MIT with Attribution (see LICENSE and NOTICE)
 */

const { listOfObjsToObj, awardCP } = require("../utils");
const { LEVELS, TIERS } = require("../config.json");

class guildService {
    constructor(database, guildId) {
        this.database = database;
        this.db = new SequelizeDatabaseService(`./guilds/${guildId}.db`)


        this.xpCache = {};
        this.registered = false;
        this.last_touched = Date.now();
    }

    async init() {
        if (!await this.isRegistered()) return;

        // Ensure tables exist and columns are up to date (safe for existing guilds)
        await this.createDatabases();
        await this.ensureCharacterExtraColumns();
        await this.ensureLevelsSeeded();   // ✅ make sure levels table has data
        await this.ensureTiersSeeded();
        await this.optimizeDatabase();     // optional perf & durability tweaks

        // Load snapshots
        this.config   = await this.loadInit("config",   "name",      "value");
        this.levels   = await this.loadInit("levels",   "level",     "xp_to_next");
        this.tiers    = await this.loadFull('tiers', 'tier')
        this.roles    = await this.loadInit("roles",    "role_id",   "xp_bonus");
        this.channels = await this.loadInit("channels", "channel_id", "xp_per_post");

        // 🔧 Normalize/migrate approve level keys (approveLevel vs approve_level)
        await this.migrateApproveLevelKey();
    }

    async loadInit(table, primaryKey, value) {
        await this.database.openDatabase();
        const sqlTable = await this.database.getAll(`SELECT * FROM ${table};`);
        await this.database.closeDatabase();
        return listOfObjsToObj(sqlTable, primaryKey, value);
    }

    async loadFull(table, primaryKey){
        await this.database.openDatabase();
        const sqlTable = await this.database.getAll(`SELECT * FROM ${table};`)
        await this.database.closeDatabase()

        return Object.fromEntries(sqlTable.map(row => [row[primaryKey], row]))
    }

    isModerator(interaction) {
        const modId = this.config?.["moderationRoleId"]
        const listOfRoles = interaction.member._roles

        return (!!modId && Array.isArray(listOfRoles) && listOfRoles.includes(modId)) || this.isOwner(interaction)
    }

    isOwner(interaction) {
        const ownerID = this.config?.["ownerRoleId"]
        const listOfRoles = interaction.member._roles
        return (!!ownerID && Array.isArray(listOfRoles) && listOfRoles.includes(ownerID)) || (interaction.guild.ownerId == interaction.user.id)
    }

    mentionOwner(interaction) {
        const ownerID = this.config?.["ownerRoleId"]

        return ownerID ? `<@&${ownerID}>` : `<@${interaction.guild.ownerId}>` 
    }

    async isRegistered() {
        try {
            await this.database.openDatabase();
            // Check the config table exists and has at least one row
            const tableRows = await this.database.getAll(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='config';"
            );
            if (!Array.isArray(tableRows) || tableRows.length === 0) {
                await this.database.closeDatabase();
                this.registered = false;
                return false;
            }
            const rows = await this.database.getAll("SELECT 1 FROM config LIMIT 1;");
            await this.database.closeDatabase();
            this.registered = Array.isArray(rows) && rows.length > 0;
        } catch (_) {
            try { await this.database.closeDatabase(); } catch {}
            this.registered = false;
        }
        return this.registered;
    }

    async deleteCharacter(character) {
        await this.database.openDatabase();
        const response = await this.database.getAll(
            `DELETE FROM characters WHERE character_id = "${character["character_id"]}";`
        );
        await this.database.closeDatabase();
        return response;
    }

    async getAllCharacters(playerId) {
        await this.database.openDatabase();
        const response = await this.database.getAll(
            `SELECT * FROM characters WHERE player_id = "${playerId}";`
        );
        await this.database.closeDatabase();
        return response;
    }

    async getAllGuildCharacters() {
        await this.database.openDatabase();
        const response = await this.database.getAll(`SELECT * FROM characters;`);
        await this.database.closeDatabase();
        return response;
    }

    async getCharacter(characterId) {
        await this.database.openDatabase();
        const response = await this.database.get(
            `SELECT * FROM characters WHERE character_id = "${characterId}";`
        );
        await this.database.closeDatabase();
        return response;
    }

    // NEW: fetch a character row by owner + index
    async getCharacterByIndex(playerId, characterIndex) {
        await this.database.openDatabase();
        const row = await this.database.get(
            `SELECT * FROM characters 
             WHERE player_id = "${playerId}" AND character_index = ${Number(characterIndex)}
             LIMIT 1;`
        );
        await this.database.closeDatabase();
        return row || null;
    }

    async insertCharacter(character) {
        const race = character.race ?? "";
        const klass = character.class ?? "";
        const background = character.background ?? "";
        const alignment = character.alignment ?? "";

        await this.database.openDatabase();
        const response = await this.database.execute(
            `INSERT INTO characters 
            (character_id, character_index, name, sheet_url, picture_url, player_id, xp, race, class, background, alignment)
            VALUES 
            ("${character.character_id}", ${character.character_index}, "${character.name}", "${character.sheet_url}", "${character.picture_url}", "${character.player_id}", ${character.xp}, "${race}", "${klass}", "${background}", "${alignment}");`
        );
        await this.database.closeDatabase();
        return response;
    }

    async updateCharacterInfo(character) {
        const race = character.race ?? "";
               const klass = character.class ?? "";
        const background = character.background ?? "";
        const alignment = character.alignment ?? "";

        await this.database.openDatabase();
        const response = await this.database.execute(
            `UPDATE characters 
             SET name = "${character.name}", 
                 sheet_url = "${character.sheet_url}", 
                 picture_url = "${character.picture_url}",
                 race = "${race}",
                 class = "${klass}",
                 background = "${background}",
                 alignment = "${alignment}"
             WHERE character_id = "${character.character_id}";`
        );
        await this.database.closeDatabase();
        return response;
    }

    async updateCharacterXP(character, deltaXp) {
        await this.database.openDatabase();
        const response = await this.database.execute(
            `UPDATE characters SET xp = xp + ${deltaXp} WHERE character_id = "${character.character_id}";`
        );
        await this.database.closeDatabase();
        return response;
    }

    async setCharacterXP(character) {
        await this.database.openDatabase();
        const response = await this.database.execute(
            `UPDATE characters SET xp = ${character.xp} WHERE character_id = "${character.character_id}";`
        );
        await this.database.closeDatabase();
        return response;
    }

    // NEW: toggle per-character ping flag
    async setCharacterPing(characterId, flag) {
        const v = flag ? 1 : 0;
        await this.database.openDatabase();
        const res = await this.database.execute(
            `UPDATE characters SET ping_on_award = ${v} WHERE character_id = "${characterId}";`
        );
        await this.database.closeDatabase();
        return res;
    }

    // Split award across all PCs (equal distribution; remainder to target)
    async applySharedAward(playerId, targetIndex, amount, kind) {
        const amt = Math.max(0, Number(amount) || 0);
        const isCP = (String(kind).toLowerCase() === "cp");
        const indexInt = Number(targetIndex);

        const all = await this.getAllCharacters(playerId);
        const list = Array.isArray(all) ? all : [];
        const n = list.length || 1;

        const base = Math.floor(amt / n);
        const remainder = amt - base * n;

        const changes = [];

        for (const ch of list) {
            const idx = Number(ch.character_index);
            const give = base + (idx === indexInt ? remainder : 0);

            const oldXp = Number(ch.xp) || 0;
            let newXp = oldXp;

            if (give > 0) {
                if (isCP) {
                    newXp = awardCP(this, oldXp, give);
                } else {
                    newXp = oldXp + give;
                }

                await this.setCharacterXP({
                    character_id: ch.character_id,
                    character_index: ch.character_index,
                    player_id: ch.player_id,
                    xp: newXp
                });
            }

            changes.push({
                character_id: ch.character_id,
                character_index: idx,
                name: ch.name,
                oldXp,
                newXp,
                deltaXp: newXp - oldXp
            });
        }

        const target = changes.find(c => c.character_index === indexInt) || null;

        return {
            count: n,
            kind: isCP ? "cp" : "xp",
            amount: amt,
            changes,
            target
        };
    }

    // Upsert config keys
    async updateConfig(config) {
        await this.database.openDatabase();
        try {
            for (const [name, value] of Object.entries(config)) {
                await this.database.execute(
                    `INSERT INTO config (name, value)
                     VALUES ("${name}", "${value}")
                     ON CONFLICT(name) DO UPDATE SET value = excluded.value;`
                );
            }
        } finally {
            await this.database.closeDatabase();
        }
        this.config = await this.loadInit("config", "name", "value");
    }

    // Alias used by some callers
    async updateServerConfig(config) {
        return this.updateConfig(config);
    }

    // Per-key upsert
    async setConfigKey(name, value) {
        await this.database.openDatabase();
        try {
            await this.database.execute(
                `INSERT INTO config (name, value)
                 VALUES ("${name}", "${value}")
                 ON CONFLICT(name) DO UPDATE SET value = excluded.value;`
            );
        } finally {
            await this.database.closeDatabase();
        }
        if (!this.config) this.config = {};
        this.config[name] = value;
    }

    async updateChannel(channelId, xpPerPost) {
        await this.database.openDatabase();
        if (xpPerPost >= 0) {
            if (channelId in this.channels) {
                await this.database.execute(
                    `UPDATE channels SET xp_per_post = ${xpPerPost} WHERE channel_id = "${channelId}";`
                );
            } else {
                await this.database.execute(
                    `INSERT INTO channels ( channel_id, xp_per_post ) VALUES ("${channelId}", ${xpPerPost});`
                );
            }
        } else {
            await this.database.execute(
                `DELETE FROM channels WHERE channel_id = "${channelId}";`
            );
        }
        await this.database.closeDatabase();

        this.channels = await this.loadInit("channels", "channel_id", "xp_per_post");
    }

    async updateLevel(level, xpToNext) {
        await this.database.openDatabase();
        await this.database.execute(
            `UPDATE levels SET xp_to_next = ${xpToNext} WHERE level = ${level};`
        );
        await this.database.closeDatabase();

        this.levels = await this.loadInit("levels", "level", "xp_to_next");
    }

    async updateTier(tier, min_level, max_level, cp_percent) {
        await this.database.openDatabase()
        await this.database.execute(
            `UPDATE tiers SET min_level = ${min_level}, max_level = ${max_level}, cp_percent = ${cp_percent} WHERE tier = ${tier}`
        )   
        await this.database.closeDatabase()

        this.tiers = await this.loadFull('tiers', 'tier')
    }

    async updateRole(roleId, xpBonus) {
        await this.database.openDatabase();
        if (xpBonus >= 0) {
            if (roleId in this.roles) {
                await this.database.execute(
                    `UPDATE roles SET xp_bonus = ${xpBonus} WHERE role_id = "${roleId}";`
                );
            } else {
                await this.database.execute(
                    `INSERT INTO roles ( role_id, xp_bonus ) VALUES ("${roleId}", ${xpBonus});`
                );
            }
        } else {
            await this.database.execute(
                `DELETE FROM roles WHERE role_id = "${roleId}";`
            );
        }
        await this.database.closeDatabase();

        this.roles = await this.loadInit("roles", "role_id", "xp_bonus");
    }

    async registerServer(configDetails) {
        await this.createDatabases();

        // Ensure approveLevel is set (support both keys on write)
        const approveLevelRaw =
            configDetails.approveLevel ??
            configDetails.approve_level ??
            1;
        const approve = Math.max(1, Math.min(20, parseInt(approveLevelRaw, 10) || 1));

        // Config
        let configInit = "INSERT OR REPLACE INTO config ( name, value ) VALUES ";
        let delimiter = "";
        for (const [name, value] of Object.entries({
            ...configDetails,
            approveLevel: String(approve),
            approve_level: String(approve), // keep legacy in sync
        })) {
            configInit += `${delimiter}("${name}", "${value}")`;
            delimiter = ",";
        }
        await this.database.openDatabase();
        await this.database.execute(configInit);
        await this.database.closeDatabase();

        // Levels (seed fresh guilds)
        await this.ensureLevelsSeeded()

        // Tiers (seed fresh guilds)
        await this.ensureTiersSeeded()

        // Roles (xpFreeze defaults)
        let rolesInit = `INSERT OR REPLACE INTO roles ( role_id, xp_bonus ) VALUES ("${configDetails["xpFreezeRoleId"]}", 0)`;
        await this.database.openDatabase();
        await this.database.execute(rolesInit);
        await this.database.closeDatabase();

        // Refresh in-memory config after register
        this.config = await this.loadInit("config", "name", "value");
    }

    async createDatabases() {
        await this.createChannelsTable();
        await this.createCharactersTable();
        await this.createConfigTable();
        await this.createLevelsTable();
        await this.createTiersTable();
        await this.createRolesTable();
    }

    async createChannelsTable() {
        await this.database.openDatabase();
        const response = await this.database.execute(
            "CREATE TABLE IF NOT EXISTS channels ( channel_id VARCHAR(100) PRIMARY KEY, xp_per_post NUMBER );"
        );
        await this.database.closeDatabase();
        return response;
    }

    async createCharactersTable() {
        await this.database.openDatabase();
        const response = await this.database.execute(
            `CREATE TABLE IF NOT EXISTS characters (
                character_id STRING PRIMARY KEY,
                character_index NUMBER,
                name VARCHAR(100),
                sheet_url VARCHAR(100),
                picture_url VARCHAR(200),
                player_id VARCHAR(100),
                xp NUMBER,
                race VARCHAR(100),
                class VARCHAR(100),
                background VARCHAR(100),
                alignment VARCHAR(50),
                ping_on_award INTEGER DEFAULT 1
            );`
        );
        await this.database.closeDatabase();
        return response;
    }

    async createConfigTable() {
        await this.database.openDatabase();
        const response = await this.database.execute(
            "CREATE TABLE IF NOT EXISTS config ( name VARCHAR(100) PRIMARY KEY, value VARCHAR(2000) );"
        );
        await this.database.closeDatabase();
        return response;
    }

    async createLevelsTable() {
        await this.database.openDatabase();
        const response = await this.database.execute(
            "CREATE TABLE IF NOT EXISTS levels ( level NUMBER PRIMARY KEY, xp_to_next NUMBER );"
        );
        await this.database.closeDatabase();
        return response;
    }

    async createTiersTable(){
        await this.database.openDatabase();
        const response = await this.database.execute(
            "CREATE TABLE IF NOT EXISTS tiers (tier NUMBER PRIMARY KEY, min_level NUMBER, max_level NUMBER, cp_percent NUMBER);"
        );
        await this.database.closeDatabase();
        return response
    }

    async createRolesTable() {
        await this.database.openDatabase();
        const response = await this.database.execute(
            "CREATE TABLE IF NOT EXISTS roles ( role_id VARCHAR(100) PRIMARY KEY, xp_bonus NUMBER );"
        );
        await this.database.closeDatabase();
        return response;
    }

    async ensureCharacterExtraColumns() {
        await this.database.openDatabase();
        try {
            const cols = await this.database.getAll(`PRAGMA table_info(characters);`);
            const names = Array.isArray(cols) ? cols.map(c => c.name) : [];

            const needed = [
                { name: "race", type: "VARCHAR(100)" },
                { name: "class", type: "VARCHAR(100)" },
                { name: "background", type: "VARCHAR(100)" },
                { name: "alignment", type: "VARCHAR(50)" },
                { name: "ping_on_award", type: "INTEGER DEFAULT 1" }
            ];

            for (const col of needed) {
                if (!names.includes(col.name)) {
                    await this.database.execute(
                        `ALTER TABLE characters ADD COLUMN ${col.name} ${col.type};`
                    );
                }
            }
        } catch (e) {
            console.error("[guildService] ensureCharacterExtraColumns error:", e);
        } finally {
            await this.database.closeDatabase();
        }
    }

    // ✅ NEW: keep levels table seeded with config LEVELS (idempotent)
    async ensureLevelsSeeded() {
        try {
            await this.database.openDatabase();
            const countRow = await this.database.get(`SELECT COUNT(*) AS c FROM levels;`).catch(() => null);
            const count = Number(countRow?.c || 0);

            // Upsert all entries from config LEVELS if table is empty or missing some
            const entries = Object.entries(LEVELS || {});
            if (count < entries.length || count === 0) {
                // Insert or replace every configured level
                for (const [level, xp] of entries) {
                    await this.database.execute(
                        `INSERT OR REPLACE INTO levels(level, xp_to_next) VALUES(${parseInt(level,10)}, ${Number(xp) || 0});`
                    );
                }
            }
        } catch (e) {
            console.warn('[guildService] ensureLevelsSeeded failed:', e?.message);
        } finally {
            try { await this.database.closeDatabase(); } catch {}
        }
    }

    async ensureTiersSeeded() {
        try {
            await this.database.openDatabase();
            const countRow = await this.database.get(`SELECT COUNT(*) AS c FROM tiers;`).catch(() => null);
            const count = Number(countRow?.c || 0);

            const entries = Object.entries(TIERS || {})
            
            if (count < entries.length || count == 0) {
                for (const [tier, data] of entries) {
                    await this.database.execute(
                        `INSERT OR REPLACE INTO tiers(tier, min_level, max_level, cp_percent) VALUES(${parseInt(tier)}, ${parseInt(data.min)}, ${parseInt(data.max)}, ${Number(data.perc) || 0});`
                    )
                }
            }

        } catch (e) {
            console.warn('[guildService] ensureTiersSeeded failed: ', e?.message);
        } finally {
            try { await this.database.closeDatabase(); } catch {}
        }
    }

    async optimizeDatabase() {
        await this.database.openDatabase();
        try {
            await this.database.execute('PRAGMA journal_mode=WAL;');
            await this.database.execute('PRAGMA synchronous=NORMAL;');

            await this.database.execute('CREATE INDEX IF NOT EXISTS idx_characters_player_id ON characters (player_id);');
            await this.database.execute('CREATE INDEX IF NOT EXISTS idx_characters_character_index ON characters (character_index);');
            await this.database.execute('CREATE INDEX IF NOT EXISTS idx_channels_channel_id ON channels (channel_id);');
            await this.database.execute('CREATE INDEX IF NOT EXISTS idx_roles_role_id ON roles (role_id);');
        } catch (e) {
            console.error('[guildService] optimizeDatabase error:', e);
        } finally {
            await this.database.closeDatabase();
        }
    }

    // ---------- Migration/Normalization Helpers ----------

    async migrateApproveLevelKey() {
        try {
            const rawCamel = this.config?.approveLevel;
            const rawSnake = this.config?.approve_level;

            const toNum = (v) => {
                if (v === undefined || v === null) return NaN;
                const n = parseInt(v, 10);
                return Number.isFinite(n) ? n : NaN;
            };

            let chosen = toNum(rawCamel);
            if (!Number.isFinite(chosen)) chosen = toNum(rawSnake);
            if (!Number.isFinite(chosen)) chosen = 1;

            chosen = Math.max(1, Math.min(20, chosen));

            if (String(this.config?.approveLevel) !== String(chosen)) {
                await this.setConfigKey("approveLevel", String(chosen));
            }
            if (String(this.config?.approve_level) !== String(chosen)) {
                await this.setConfigKey("approve_level", String(chosen));
            }
        } catch (e) {
            console.warn("[guildService] migrateApproveLevelKey failed:", e?.message);
        }

        // Refresh local snapshot
        this.config = await this.loadInit("config", "name", "value");
    }

    getApproveLevel() {
        const raw =
            this.config?.approveLevel ??
            this.config?.approve_level ??
            1;
        const n = parseInt(raw, 10);
        return Math.max(1, Math.min(20, Number.isFinite(n) ? n : 1));
    }
}

module.exports = { guildService };
