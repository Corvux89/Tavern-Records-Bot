const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('health')
    .setDescription('Owner: show bot/guild health and config sanity')
    .addBooleanOption(o =>
      o.setName('public')
        .setDescription('Show this output to everyone?')
        .setRequired(false)
    ),

  async execute(guildService, interaction) {
    // Owner only
    if (!guildService.isOwner(interaction)) {
      await interaction.editReply('Only the server owner can use /health.');
      return;
    }

    const publicResp = interaction.options.getBoolean('public') ?? false;
    const g = interaction.guild;

    // 1) Registration check
    const registered = await guildService.isRegistered();

    // 2) Required config keys for a smooth experience
    const requiredKeys = [
      'moderationRoleId',
      'xpFreezeRoleId',
      'xpShareRoleId',
      'levelUpChannelId',
      'characterCount',
      'xpPerPostDivisor',
      'xpPerPostFormula',
      'tier1RoleId', 'tier2RoleId', 'tier3RoleId', 'tier4RoleId'
    ];

    const missing = [];
    for (const k of requiredKeys) {
      if (!guildService.config?.[k]) missing.push(k);
    }

    // 3) Simple value validation
    const numericIssues = [];
    const charCount = Number(guildService.config?.characterCount);
    if (!Number.isInteger(charCount) || charCount < 1 || charCount > 10) {
      numericIssues.push(`characterCount should be an integer 1–10 (got: ${guildService.config?.characterCount ?? 'unset'})`);
    }

    const divisor = Number(guildService.config?.xpPerPostDivisor);
    if (!Number.isFinite(divisor) || divisor <= 0) {
      numericIssues.push(`xpPerPostDivisor should be a positive number (got: ${guildService.config?.xpPerPostDivisor ?? 'unset'})`);
    }

    const allowedFormula = new Set(['flat', 'linear', 'exponential']);
    const formula = guildService.config?.xpPerPostFormula;
    const formulaIssue = !formula || !allowedFormula.has(formula);
    // leave a hint to fix it if wrong
    // (don't push to missing; push to its own list)
    const formulaMsg = formulaIssue ? `xpPerPostFormula must be one of: flat | linear | exponential (got: ${formula ?? 'unset'})` : null;

    // 4) Helpers to check existence
    const fetchRole = async (id) => {
      if (!id) return { ok: false, id, note: 'missing id' };
      try { const r = await g.roles.fetch(id); return { ok: !!r, id, mention: r ? `<@&${id}>` : null }; }
      catch { return { ok: false, id }; }
    };
    const fetchChan = async (id) => {
      if (!id) return { ok: false, id, note: 'missing id' };
      try { const c = await g.channels.fetch(id); return { ok: !!c, id, mention: c ? `<#${id}>` : null }; }
      catch { return { ok: false, id }; }
    };

    // 5) Roles/channels to check
    const checks = {
      moderationRole: await fetchRole(guildService.config?.moderationRoleId),
      ownerRole: await fetchRole(guildService.config?.ownerRoleId),
      xpFreezeRole: await fetchRole(guildService.config?.xpFreezeRoleId),
      xpShareRole: await fetchRole(guildService.config?.xpShareRoleId),
      levelUpChannel: await fetchChan(guildService.config?.levelUpChannelId),
      tier1: await fetchRole(guildService.config?.tier1RoleId),
      tier2: await fetchRole(guildService.config?.tier2RoleId),
      tier3: await fetchRole(guildService.config?.tier3RoleId),
      tier4: await fetchRole(guildService.config?.tier4RoleId),
    };

    // 6) Character slot roles (validate dynamically up to characterCount or 1 if missing)
    const charRoleResults = [];
    const charSlots = Number.isInteger(charCount) ? charCount : 1;
    for (let i = 1; i <= charSlots; i++) {
      const id = guildService.config?.[`character${i}RoleId`];
      const res = await fetchRole(id);
      charRoleResults.push({ i, ...res });
      if (!id) missing.push(`character${i}RoleId`);
    }

    // 7) Levels sanity (must exist; we don’t validate values deeply here)
    const levelsOk = guildService.levels && Object.keys(guildService.levels).length > 0;

    // Tier Sanity (must exist; and we do validate values deeply here)
    let tiersOk = guildService.tiers ? true : false;
    let lastMax = null;
    const tierList = Object.values(guildService.tiers).sort((a, b) => a.min_level - b.min_level);

    for (const tier of tierList) {
      if (lastMax !== null && tier.min_level !== lastMax + 1) {
        tiersOk = false;
        break;
      }
      if (tier.min_level > tier.max_level) {
        tiersOk = false;
        break;
      }
      lastMax = tier.max_level;
    }

    // 8) Build readable summary lines
    const mark = (ok) => ok ? '✅' : '❌';
    const lines = [];

    lines.push(`${mark(registered)} server registered`);
    if (missing.length) {
      lines.push(`⚠️ Missing config keys: \`${missing.join('`, `')}\``);
    }

    if (numericIssues.length || formulaMsg) {
      lines.push('⚠️ Config value issues:');
      for (const n of numericIssues) lines.push(`• ${n}`);
      if (formulaMsg) lines.push(`• ${formulaMsg}`);
    }

    lines.push(
      `${mark(checks.moderationRole.ok)} moderationRoleId ${checks.moderationRole.mention ?? ''}`.trim(),
      `${mark(checks.ownerRole.ok)} ownerRoleId ${checks.ownerRole?.mention || '*Defaults to Server Owner*'}`.trim(),
      `${mark(checks.xpFreezeRole.ok)} xpFreezeRoleId ${checks.xpFreezeRole.mention ?? ''}`.trim(),
      `${mark(checks.xpShareRole.ok)} xpShareRoleId ${checks.xpShareRole.mention ?? ''}`.trim(),
      `${mark(checks.levelUpChannel.ok)} levelUpChannelId ${checks.levelUpChannel.mention ?? ''}`.trim(),
      `${mark(checks.tier1.ok)} tier1RoleId ${checks.tier1.mention ?? ''}`.trim(),
      `${mark(checks.tier2.ok)} tier2RoleId ${checks.tier2.mention ?? ''}`.trim(),
      `${mark(checks.tier3.ok)} tier3RoleId ${checks.tier3.mention ?? ''}`.trim(),
      `${mark(checks.tier4.ok)} tier4RoleId ${checks.tier4.mention ?? ''}`.trim(),
      `${mark(levelsOk)} levels present`,
      `${mark(tiersOk)} tiers arranged nicely`
    );

    for (const r of charRoleResults) {
      lines.push(`${mark(r.ok)} character${r.i}RoleId ${r.mention ?? ''}`.trim());
    }

    // 8.a Permissions
    const pString = []
    pString.push(
      `${mark(interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles))} Manage Roles`.trim(),
      `${mark(interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageChannels))} Manage Channels`.trim(),
      `${mark(interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ViewChannel))} View Channels`.trim(),
      `${mark(interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageMessages))} Manage Messages`.trim(),
      `${mark(interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ReadMessageHistory))} Message History`.trim(),
      `${mark(interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.SendMessages))} Send Messages`.trim(),
      `${mark(interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.SendMessagesInThreads))} Send Messages in Threads`.trim(),
    )

    // 9) Final embed
    const embed = new EmbedBuilder()
      .setTitle(`Health Check — ${g.name}`)
      .setDescription(lines.join('\n'))
      .setColor((!registered || missing.length || numericIssues.length || formulaMsg || !levelsOk) ? 0xFFA500 : 0x57F287) // amber if issues, green if good
      .setTimestamp()
      .addFields(
        { name: 'Bot Permissions', value: pString.join('\n')}
      );

    // Small tips if something is off
    const tips = [];
    if (!registered) tips.push('Run `/register` to set up this server.');
    if (missing.includes('levelUpChannelId')) tips.push('Use `/edit_config level_up_channel` to set your level-up channel.');
    if (missing.some(k => k.startsWith('tier'))) tips.push('Use `/edit_config` to set your tier role IDs.');
    if (missing.some(k => k.startsWith('character'))) tips.push('Use `/edit_config` to set character slot role IDs.');
    if (formulaMsg) tips.push('Try `/edit_config xp_per_post_formula` to set `flat`, `linear`, or `exponential`.');
    if (numericIssues.length) tips.push('Check `/edit_config` numeric fields like `character_count` and `xp_per_post_divisor`.');

    if (tips.length) {
      embed.addFields({ name: 'How to fix', value: tips.map(t => `• ${t}`).join('\n') });
    }

    await interaction.editReply({ ephemeral: !publicResp, embeds: [embed] });
  }
};
