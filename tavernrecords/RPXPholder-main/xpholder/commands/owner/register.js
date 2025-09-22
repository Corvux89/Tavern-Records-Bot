const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageFlags } = require('discord-api-types/v10');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('register')
        .setDescription('Registers or updates server roles/config [ OWNER ]')
        .addRoleOption(option => option
            .setName("moderation_role")
            .setDescription("A Role Which Allows Users To Use The Mod Commands")
            .setRequired(true))
        .addIntegerOption(option => option
            .setName("number_of_characters")
            .setDescription("How many characters each player can have (1–10)")
            .setMinValue(1)
            .setMaxValue(10)
            .setRequired(true))
        .addBooleanOption(option => option
            .setName("public")
            .setDescription("Show This Command To Everyone?")
            .setRequired(false)),

    async execute(guildService, interaction) {
        // Owner check
        if (!guildService.isOwner(interaction)) {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
            }
            await interaction.editReply("Sorry, but you are not the owner of the server, and cannot use this command.");
            return;
        }

        // Defer (use flags to avoid deprecation warning)
        try {
            if (!interaction.deferred && !interaction.replied) {
                const isPublic = interaction.options.getBoolean("public") ?? false;
                await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral });
            }
        } catch (_) {}

        // Ensure service is ready and tables exist
        try { await guildService.createDatabases?.(); } catch (_) {}
        try { await guildService.init(); } catch (_) {}

        const GUILD = interaction.guild;
        const ROLES = GUILD.roles;

        const targetCount = interaction.options.getInteger("number_of_characters");
        const moderationRole = interaction.options.getRole("moderation_role");

        // Fetch ALL roles once so we can scan by name
        let allRoles;
        try {
            allRoles = await ROLES.fetch();
        } catch (e) {
            console.error("[register] failed to fetch roles:", e);
            await interaction.editReply("I couldn't fetch the server roles. Do I have **View Server Insights** and **Manage Roles**?");
            return;
        }

        // Helper: normalize role name for case-insensitive exact match
        const norm = s => String(s || "").trim().toLowerCase();

        const findRoleByName = (name) => {
            const wanted = norm(name);
            return allRoles.find(r => norm(r.name) === wanted) || null;
        };

        // Helper: create or reuse role by ID or by NAME (exact, case-insensitive)
        const ensureRoleSmart = async (existingId, desiredName, createProps) => {
            // 1) If config has an ID and it exists, use it
            if (existingId) {
                try {
                    const r = await ROLES.fetch(existingId).catch(() => null);
                    if (r) return r.id;
                } catch (_) {}
            }

            // 2) Reuse existing role by name, if present
            const byName = findRoleByName(desiredName);
            if (byName) return byName.id;

            // 3) Create a new one
            const created = await ROLES.create({ name: desiredName, ...createProps });
            // Update the cache list so subsequent lookups during this run can see it
            allRoles.set(created.id, created);
            return created.id;
        };

        // Persist config (create or update) with maximum compatibility
        const upsertConfig = async (configObj) => {
            if (typeof guildService.updateServerConfig === "function") {
                await guildService.updateServerConfig(configObj);
            } else if (typeof guildService.saveConfig === "function") {
                await guildService.saveConfig(configObj);
            } else if (typeof guildService.setConfigKey === "function") {
                for (const [k, v] of Object.entries(configObj)) {
                    await guildService.setConfigKey(k, v);
                }
            } else if (!await guildService.isRegistered()) {
                await guildService.registerServer(configObj);
            } else {
                throw new Error("No config update method found on guildService.");
            }
        };

        const firstTime = !await guildService.isRegistered();

        // Start from current config if registered
        const cfg = firstTime ? {} : { ...(guildService.config || {}) };

        // Always (re)set these keys to current choices
        cfg.moderationRoleId = moderationRole.id;
        cfg.levelUpChannelId = interaction.channelId;

        // Ensure sane defaults on first registration (strings are fine; DB stores text)
        if (firstTime && cfg.approveLevel == null)            cfg.approveLevel = "1";
        if (firstTime && cfg.approveMessage == null)          cfg.approveMessage = "Congratulations! Your character is approved!";
        if (firstTime && cfg.roleBonus == null)               cfg.roleBonus = "highest";
        if (firstTime && cfg.xpPerPostFormula == null)        cfg.xpPerPostFormula = "exponential";
        if (firstTime && cfg.xpPerPostDivisor == null)        cfg.xpPerPostDivisor = "100";
        if (firstTime && cfg.allowPlayerManageXp == null)     cfg.allowPlayerManageXp = "off";

        // Colors (Discord.js expects hex ints)
        const COLORS = {
            TIER_1: 0x3B82F6, // blue
            TIER_2: 0x8B5CF6, // purple
            TIER_3: 0x22C55E, // green
            TIER_4: 0xFACC15, // yellow
            FREEZE: 0xA5F3FC, // cyan
            SHARE:  0xEC4899  // pink
        };

        // Ensure Tier & Utility roles exist — reuse by name if IDs are missing
        try {
            cfg.tier1RoleId = await ensureRoleSmart(cfg.tier1RoleId, "Tier 1", { color: COLORS.TIER_1, hoist: true, mentionable: true });
            cfg.tier2RoleId = await ensureRoleSmart(cfg.tier2RoleId, "Tier 2", { color: COLORS.TIER_2, hoist: true, mentionable: true });
            cfg.tier3RoleId = await ensureRoleSmart(cfg.tier3RoleId, "Tier 3", { color: COLORS.TIER_3, hoist: true, mentionable: true });
            cfg.tier4RoleId = await ensureRoleSmart(cfg.tier4RoleId, "Tier 4", { color: COLORS.TIER_4, hoist: true, mentionable: true });

            cfg.xpFreezeRoleId = await ensureRoleSmart(cfg.xpFreezeRoleId, "❄️XP Freeze ❄️", { color: COLORS.FREEZE, hoist: true, mentionable: true });
            cfg.xpShareRoleId  = await ensureRoleSmart(cfg.xpShareRoleId,  "🎁XP Share 🎁",  { color: COLORS.SHARE,  hoist: true, mentionable: true });
        } catch (e) {
            console.error("[register] tier/utility role ensure failed:", e);
            await interaction.editReply("I couldn't create or fetch one of the tier/utility roles. Make sure I have **Manage Roles** and my top role is above the roles I need to manage.");
            return;
        }

        // Character roles — ensure up to desired count; reuse by name if ID missing
        const currentCount = Number(cfg.characterCount) || 0;

        try {
            for (let i = 1; i <= targetCount; i++) {
                const key = `character${i}RoleId`;
                cfg[key] = await ensureRoleSmart(cfg[key], `Character ${i}`, {});
            }
            // Do not delete roles if targetCount < existing; just lower the count (keeps existing roles intact)
            cfg.characterCount = String(targetCount);
        } catch (e) {
            console.error("[register] character role ensure failed:", e);
            await interaction.editReply("I couldn't create or fetch one or more character roles. Check my **Manage Roles** permission and role hierarchy.");
            return;
        }

        // Persist config (create or update)
        try {
            await upsertConfig(cfg);
            await guildService.init(); // reload in-memory snapshot
        } catch (e) {
            console.error("[register] config upsert failed:", e);
            await interaction.editReply("I verified/created roles, but failed to save configuration to the database.");
            return;
        }

        // Final message
        if (firstTime) {
            await interaction.editReply(
                `Success! Server registered.\n` +
                `• Ensured tier/util roles\n` +
                `• Ensured ${targetCount} character role(s)\n` +
                `• Set defaults (approve level **1**, level-up channel, etc.)\n` +
                `• Reused any identically named roles where possible`
            );
        } else if (targetCount > currentCount) {
            await interaction.editReply(
                `Success! Upgraded character slots from **${currentCount}** to **${targetCount}**.\n` +
                `• Reused existing roles where possible\n` +
                `• Created only the missing roles (Character ${currentCount + 1}–${targetCount})`
            );
        } else if (targetCount < currentCount) {
            await interaction.editReply(
                `Success! Lowered characterCount to **${targetCount}**.\n` +
                `Existing extra roles remain untouched (safe to repurpose or delete manually).`
            );
        } else {
            await interaction.editReply(
                `Success! Verified all roles and updated settings — no new character roles were needed.\n` +
                `Identically named roles were reused where applicable.`
            );
        }
    },
};
