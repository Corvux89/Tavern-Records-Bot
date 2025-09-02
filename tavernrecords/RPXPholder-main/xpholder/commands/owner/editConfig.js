const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const { MessageFlags } = require('discord-api-types/v10');
const { DONATE_URL } = require("../../config.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('edit_config')
    .setDescription('Edit Tavern Records configuration [OWNER/MOD]')

    // -------- GENERAL GROUP --------
    .addSubcommandGroup(g =>
      g.setName('general').setDescription('General configuration')
        .addSubcommand(s =>
          s.setName('approve_level')
           .setDescription('Set the starting level for new approvals (1–20)')
           .addIntegerOption(o => o.setName('level').setDescription('Level (1–20)').setMinValue(1).setMaxValue(20).setRequired(true))
           .addBooleanOption(o => o.setName('public').setDescription('Show this publicly?')))
        .addSubcommand(s =>
          s.setName('approve_message')
           .setDescription('Set the approval DM message')
           .addStringOption(o => o.setName('message').setDescription('Text players see when approved').setMaxLength(1900).setRequired(true))
           .addBooleanOption(o => o.setName('public').setDescription('Show this publicly?')))
        .addSubcommand(s =>
          s.setName('level_up_message')
           .setDescription('Set the level-up message')
           .addStringOption(o => o.setName('message').setDescription('Text posted on level-up').setMaxLength(1900).setRequired(true))
           .addBooleanOption(o => o.setName('public').setDescription('Show this publicly?')))
        .addSubcommand(s =>
          s.setName('level_up_channel')
           .setDescription('Set which channel receives level-up posts')
           .addChannelOption(o =>
              o.setName('channel')
               .setDescription('Channel for level-ups')
               .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
               .setRequired(true))
           .addBooleanOption(o => o.setName('public').setDescription('Show this publicly?')))
        .addSubcommand(s =>
          s.setName('role_bonus')
           .setDescription('How to apply bonus XP roles')
           .addStringOption(o =>
             o.setName('mode')
              .setDescription('highest = best single bonus, sum = add them all')
              .addChoices(
                { name: 'highest', value: 'highest' },
                { name: 'sum', value: 'sum' })
              .setRequired(true))
           .addBooleanOption(o => o.setName('public').setDescription('Show this publicly?')))
        .addSubcommand(s =>
          s.setName('allow_player_manage_xp')
           .setDescription('Allow players to manage their own XP requests')
           .addStringOption(o =>
             o.setName('value')
              .setDescription('on / off')
              .addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' })
              .setRequired(true))
           .addBooleanOption(o => o.setName('public').setDescription('Show this publicly?')))
        .addSubcommand(s =>
          s.setName('xp_per_post_formula')
           .setDescription('Change XP per post formula')
           .addStringOption(o =>
             o.setName('formula')
              .setDescription('Formula type')
              .addChoices(
                { name: 'exponential', value: 'exponential' },
                { name: 'linear', value: 'linear' },
                { name: 'flat', value: 'flat' })
              .setRequired(true))
           .addBooleanOption(o => o.setName('public').setDescription('Show this publicly?')))
        .addSubcommand(s =>
          s.setName('xp_per_post_divisor')
           .setDescription('Set XP-per-post divisor (lower = more XP)')
           .addIntegerOption(o =>
             o.setName('divisor').setDescription('1–1000 (suggested: 100)')
              .setMinValue(1).setMaxValue(1000).setRequired(true))
           .addBooleanOption(o => o.setName('public').setDescription('Show this publicly?')))
        .addSubcommand(s =>
          s.setName('health_auto_dm')
           .setDescription('Auto-DM owner if startup issues are found')
           .addStringOption(o =>
             o.setName('value').setDescription('on / off')
              .addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' })
              .setRequired(true))
           .addBooleanOption(o => o.setName('public').setDescription('Show this publicly?')))
        .addSubcommand(s =>
          s.setName('number_of_characters')
           .setDescription('Set how many character slots each player has (1–10)')
           .addIntegerOption(o => o.setName('count').setDescription('1–10').setMinValue(1).setMaxValue(10).setRequired(true))
           .addBooleanOption(o => o.setName('create_missing_roles').setDescription('Auto-create missing Character roles'))
           .addBooleanOption(o => o.setName('public').setDescription('Show this publicly?')))
    )

    // -------- ROLES GROUP --------
    .addSubcommandGroup(g =>
      g.setName('roles').setDescription('Role configuration')
        .addSubcommand(s =>
          s.setName('moderation_role')
           .setDescription('Set which role can use mod commands')
           .addRoleOption(o => o.setName('role').setDescription('Mod role').setRequired(true))
           .addBooleanOption(o => o.setName('public').setDescription('Show this publicly?')))
        .addSubcommand(s =>
          s.setName('tier_role')
           .setDescription('Set the role for a specific Tier (1–4)')
           .addIntegerOption(o => o.setName('tier').setDescription('Tier 1–4').setMinValue(1).setMaxValue(4).setRequired(true))
           .addRoleOption(o => o.setName('role').setDescription('Role to use for this tier').setRequired(true))
           .addBooleanOption(o => o.setName('public').setDescription('Show this publicly?')))
        .addSubcommand(s =>
          s.setName('xp_freeze_role')
           .setDescription('Set the XP Freeze role')
           .addRoleOption(o => o.setName('role').setDescription('Freeze role').setRequired(true))
           .addBooleanOption(o => o.setName('public').setDescription('Show this publicly?')))
        .addSubcommand(s =>
          s.setName('xp_share_role')
           .setDescription('Set the XP Share role')
           .addRoleOption(o => o.setName('role').setDescription('Share role').setRequired(true))
           .addBooleanOption(o => o.setName('public').setDescription('Show this publicly?')))
    )

    // -------- ADVANCED GROUP --------
    .addSubcommandGroup(g =>
      g.setName('advanced').setDescription('Advanced / raw config writes')
        .addSubcommand(s =>
          s.setName('set')
           .setDescription('Set a raw config key/value')
           .addStringOption(o => o.setName('key').setDescription('Config key (e.g., approveLevel)').setRequired(true))
           .addStringOption(o => o.setName('value').setDescription('Value as string').setRequired(true))
           .addBooleanOption(o => o.setName('public').setDescription('Show this publicly?')))
    ),

  async execute(guildService, interaction) {
    // Permissions: owner or mod role
    const isOwner = interaction.user.id === interaction.guild.ownerId;
    const isMod = guildService.isMod(interaction.member._roles);
    if (!isOwner && !isMod) {
      if (!interaction.deferred && !interaction.replied) {
        try { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); } catch {}
      }
      await interaction.editReply("Sorry, you do not have permission to use this command.");
      return;
    }

    // Safe defer
    const isPublic = interaction.options.getBoolean('public') ?? false;
    if (!interaction.deferred && !interaction.replied) {
      try { await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral }); } catch {}
    }

    const group = interaction.options.getSubcommandGroup();
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const rolesApi = guild.roles;

    // Utilities
    const ok = (title, fields = [], color = 0x57F287, extra = "") =>
      new EmbedBuilder()
        .setTitle(title)
        .addFields(fields)
        .setColor(color)
        .setFooter({ text: `Support the bot: ${DONATE_URL}${extra ? ` • ${extra}` : ""}` });

    const ensureRole = async (existingId, createProps) => {
      try {
        if (existingId) {
          const r = await rolesApi.fetch(existingId).catch(() => null);
          if (r) return r.id;
        }
      } catch {}
      const created = await rolesApi.create(createProps);
      return created.id;
    };

    try {
      // ========== GENERAL ==========
      if (group === 'general') {
        if (sub === 'approve_level') {
          let lvl = interaction.options.getInteger('level');
          if (!Number.isFinite(lvl)) lvl = 1;
          lvl = Math.max(1, Math.min(20, Math.floor(lvl)));

          await guildService.setConfigKey('approveLevel', String(lvl));
          await guildService.setConfigKey('approve_level', String(lvl)); // legacy mirror

          return interaction.editReply({
            embeds: [ok("Config Updated — Approve Level", [
              { name: "approveLevel", value: String(lvl), inline: true },
              { name: "approve_level (legacy)", value: String(lvl), inline: true },
            ])]
          });
        }

        if (sub === 'approve_message') {
          const message = interaction.options.getString('message') || "";
          await guildService.setConfigKey('approveMessage', message);
          await guildService.setConfigKey('approve_message', message); // legacy mirror
          return interaction.editReply({
            embeds: [ok("Config Updated — Approve Message", [
              { name: "approveMessage", value: message.slice(0, 1024) || "(empty)" }
            ])]
          });
        }

        if (sub === 'level_up_message') {
          const message = interaction.options.getString('message') || "";
          await guildService.setConfigKey('levelUpMessage', message);
          await guildService.setConfigKey('level_up_message', message); // legacy
          return interaction.editReply({
            embeds: [ok("Config Updated — Level-Up Message", [
              { name: "levelUpMessage", value: message.slice(0, 1024) || "(empty)" }
            ])]
          });
        }

        if (sub === 'level_up_channel') {
          const channel = interaction.options.getChannel('channel');
          await guildService.setConfigKey('levelUpChannelId', channel.id);
          await guildService.setConfigKey('level_up_channel', channel.id); // legacy
          return interaction.editReply({
            embeds: [ok("Config Updated — Level-Up Channel", [
              { name: "levelUpChannelId", value: `<#${channel.id}>`, inline: true }
            ])]
          });
        }

        if (sub === 'role_bonus') {
          const mode = interaction.options.getString('mode');
          await guildService.setConfigKey('roleBonus', mode);
          return interaction.editReply({
            embeds: [ok("Config Updated — Role Bonus", [
              { name: "roleBonus", value: mode, inline: true }
            ])]
          });
        }

        if (sub === 'allow_player_manage_xp') {
          const val = interaction.options.getString('value'); // on/off
          await guildService.setConfigKey('allowPlayerManageXp', val);
          return interaction.editReply({
            embeds: [ok("Config Updated — Allow Player Manage XP", [
              { name: "allowPlayerManageXp", value: val, inline: true }
            ])]
          });
        }

        if (sub === 'xp_per_post_formula') {
          const f = interaction.options.getString('formula');
          await guildService.setConfigKey('xpPerPostFormula', f);
          return interaction.editReply({
            embeds: [ok("Config Updated — XP per Post Formula", [
              { name: "xpPerPostFormula", value: f, inline: true }
            ])]
          });
        }

        if (sub === 'xp_per_post_divisor') {
          const d = interaction.options.getInteger('divisor');
          await guildService.setConfigKey('xpPerPostDivisor', String(d));
          return interaction.editReply({
            embeds: [ok("Config Updated — XP per Post Divisor", [
              { name: "xpPerPostDivisor", value: String(d), inline: true }
            ])]
          });
        }

        if (sub === 'health_auto_dm') {
          const v = interaction.options.getString('value'); // on/off
          await guildService.setConfigKey('healthAutoDM', v);
          return interaction.editReply({
            embeds: [ok("Config Updated — Health Auto DM", [
              { name: "healthAutoDM", value: v, inline: true }
            ])]
          });
        }

        if (sub === 'number_of_characters') {
          const count = interaction.options.getInteger('count');
          const autocreate = interaction.options.getBoolean('create_missing_roles') ?? false;

          const prevCount = Number(guildService.config?.characterCount) || 0;
          await guildService.setConfigKey('characterCount', String(count));

          let created = [];
          if (autocreate) {
            for (let i = 1; i <= count; i++) {
              const key = `character${i}RoleId`;
              let rid = guildService.config?.[key];
              try {
                if (rid) {
                  const exists = await rolesApi.fetch(rid).catch(() => null);
                  if (exists) continue; // keep existing
                }
                // either missing or deleted → (re)create
                const r = await rolesApi.create({ name: `Character ${i}` });
                rid = r.id;
                await guildService.setConfigKey(key, rid);
                created.push(`<@&${rid}>`);
              } catch {}
            }
          }

          return interaction.editReply({
            embeds: [ok("Config Updated — Character Slots", [
              { name: "characterCount", value: String(count), inline: true },
              ...(autocreate ? [{ name: "Roles Created", value: created.length ? created.join(' ') : "None", inline: false }] : [])
            ], 0x57F287, autocreate ? "Used auto-create" : "")]
          });
        }
      }

      // ========== ROLES ==========
      if (group === 'roles') {
        if (sub === 'moderation_role') {
          const role = interaction.options.getRole('role');
          await guildService.setConfigKey('moderationRoleId', role.id);
          return interaction.editReply({
            embeds: [ok("Config Updated — Moderation Role", [
              { name: "moderationRoleId", value: `<@&${role.id}>`, inline: true }
            ])]
          });
        }

        if (sub === 'tier_role') {
          const tier = interaction.options.getInteger('tier');
          const role = interaction.options.getRole('role');
          await guildService.setConfigKey(`tier${tier}RoleId`, role.id);
          return interaction.editReply({
            embeds: [ok("Config Updated — Tier Role", [
              { name: `tier${tier}RoleId`, value: `<@&${role.id}>`, inline: true }
            ])]
          });
        }

        if (sub === 'xp_freeze_role') {
          const role = interaction.options.getRole('role');
          await guildService.setConfigKey('xpFreezeRoleId', role.id);
          return interaction.editReply({
            embeds: [ok("Config Updated — XP Freeze Role", [
              { name: "xpFreezeRoleId", value: `<@&${role.id}>`, inline: true }
            ])]
          });
        }

        if (sub === 'xp_share_role') {
          const role = interaction.options.getRole('role');
          await guildService.setConfigKey('xpShareRoleId', role.id);
          return interaction.editReply({
            embeds: [ok("Config Updated — XP Share Role", [
              { name: "xpShareRoleId", value: `<@&${role.id}>`, inline: true }
            ])]
          });
        }
      }

      // ========== ADVANCED ==========
      if (group === 'advanced' && sub === 'set') {
        const key = interaction.options.getString('key');
        const value = interaction.options.getString('value');

        // If they set approve keys, mirror both
        if (key === 'approveLevel' || key === 'approve_level') {
          const n = Number(value);
          if (Number.isFinite(n)) {
            const lvl = Math.max(1, Math.min(20, Math.floor(n)));
            await guildService.setConfigKey('approveLevel', String(lvl));
            await guildService.setConfigKey('approve_level', String(lvl));
          } else {
            await guildService.setConfigKey('approveLevel', value);
            await guildService.setConfigKey('approve_level', value);
          }
        } else {
          await guildService.setConfigKey(key, value);
        }

        return interaction.editReply({
          embeds: [ok("Config Updated — Advanced Set", [
            { name: "Key", value: '`' + key + '`', inline: true },
            { name: "Value", value: '`' + value + '`', inline: true }
          ])]
        });
      }

      // Fallback (shouldn’t happen)
      await interaction.editReply("Unknown subcommand.");
    } catch (e) {
      console.error("[edit_config] error:", e);
      try {
        await interaction.editReply("Something went wrong updating the config. Check bot logs.");
      } catch {}
    }
  }
};
