// xpholder/commands/owner/exportData.js
const { SlashCommandBuilder } = require('@discordjs/builders');
const { AttachmentBuilder, BaseGuildEmojiManager } = require('discord.js');
const { MessageFlags } = require('discord-api-types/v10');

function toCsvRow(arr) {
  return arr.map(v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',');
}

function mapToCsv(mapObj, headers) {
  const rows = [toCsvRow(headers)];
  for (const [k, v] of Object.entries(mapObj || {})) {
    if (typeof v == 'object' && v !== null){
      rows.push(toCsvRow(headers.map(h => v[h])));
    } else {
      rows.push(toCsvRow([k, v]));
    }
    
  }
  return rows.join('\n') + '\n';
}

function charactersToCsv(list) {
  const headers = [
    'character_id','character_index','name','sheet_url','picture_url',
    'player_id','xp','race','class','background','alignment','ping_on_award'
  ];
  const rows = [toCsvRow(headers)];
  for (const ch of (list || [])) {
    rows.push(toCsvRow([
      ch.character_id,
      ch.character_index,
      ch.name,
      ch.sheet_url,
      ch.picture_url,
      ch.player_id,
      ch.xp,
      ch.race ?? '',
      ch.class ?? '',
      ch.background ?? '',
      ch.alignment ?? '',
      (ch.ping_on_award ?? 1)
    ]));
  }
  return rows.join('\n') + '\n';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('export_data')
    .setDescription('Export server data as CSV attachments [OWNER]')
    .addBooleanOption(opt =>
      opt.setName('public').setDescription('Show this output publicly?').setRequired(false)
    ),
  async execute(guildService, interaction) {
    if (!guildService.isOwner(interaction)) {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      await interaction.editReply('Sorry, only the **server owner** can use this command.');
      return;
    }

    // Defer safely
    if (!interaction.deferred && !interaction.replied) {
      const isPublic = interaction.options.getBoolean('public') ?? false;
      await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral }).catch(() => {});
    }

    try {
      // Ensure tables exist and in-memory snapshots loaded
      try { await guildService.createDatabases?.(); } catch {}
      try { await guildService.init(); } catch {}

      // Gather data
      const characters = await guildService.getAllGuildCharacters();
      const configCsv   = mapToCsv(guildService.config || {}, ['name','value']);
      const levelsCsv   = mapToCsv(guildService.levels || {}, ['level','xp_to_next']);
      const tiersCsv    = mapToCsv(guildService.tiers || {}, ['tier', 'min_level', 'max_level', 'cp_percent']);
      const rolesCsv    = mapToCsv(guildService.roles || {}, ['role_id','xp_bonus']);
      const channelsCsv = mapToCsv(guildService.channels || {}, ['channel_id','xp_per_post']);
      const charsCsv    = charactersToCsv(characters || []);

      // Build attachments
      const files = [
        new AttachmentBuilder(Buffer.from(configCsv, 'utf8'),   { name: 'config.csv' }),
        new AttachmentBuilder(Buffer.from(levelsCsv, 'utf8'),   { name: 'levels.csv' }),
        new AttachmentBuilder(Buffer.from(tiersCsv, 'utf-8'),   { name: 'tiers.csv'}),
        new AttachmentBuilder(Buffer.from(rolesCsv, 'utf8'),    { name: 'roles.csv' }),
        new AttachmentBuilder(Buffer.from(channelsCsv, 'utf8'), { name: 'channels.csv' }),
        new AttachmentBuilder(Buffer.from(charsCsv, 'utf8'),    { name: 'characters.csv' }),
      ];

      await interaction.editReply({
        content: 'Here are your CSV exports. You can import these on the new bot with `/import_data`.',
        files
      });
    } catch (e) {
      console.error('[export_data] failed:', e);
      try { await interaction.editReply('Export failed. Check bot logs.'); } catch {}
    }
  }
};
