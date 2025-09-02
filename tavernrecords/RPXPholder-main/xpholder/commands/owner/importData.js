// xpholder/commands/owner/importData.js
const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageFlags } = require('discord-api-types/v10');

// Simple CSV parser (handles quotes and commas)
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i+1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') pushField();
      else if (c === '\n' || c === '\r') {
        // handle CRLF / LF
        if (c === '\r' && text[i+1] === '\n') i++;
        pushField(); pushRow();
      } else field += c;
    }
  }
  // last field/row
  pushField();
  if (row.length > 1 || (row.length === 1 && row[0] !== '')) pushRow();
  return rows;
}

function csvToObjects(csvText) {
  const rows = parseCsv(csvText.trim());
  if (rows.length === 0) return [];
  const headers = rows[0].map(h => h.trim().toLowerCase());
  const list = [];
  for (let i = 1; i < rows.length; i++) {
    const obj = {};
    const r = rows[i];
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = r[j] ?? '';
    }
    list.push(obj);
  }
  return list;
}

// Try to fetch attachment content (Node 18+ has global fetch)
async function fetchText(attachment) {
  if (!attachment?.url) return '';
  const res = await fetch(attachment.url);
  return await res.text();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('import_data')
    .setDescription('Import server data from CSVs [OWNER]')
    .addAttachmentOption(o =>
      o.setName('characters_csv').setDescription('characters.csv (required)').setRequired(true))
    .addAttachmentOption(o =>
      o.setName('config_csv').setDescription('config.csv').setRequired(false))
    .addAttachmentOption(o =>
      o.setName('levels_csv').setDescription('levels.csv').setRequired(false))
    .addAttachmentOption(o =>
      o.setName('roles_csv').setDescription('roles.csv').setRequired(false))
    .addAttachmentOption(o =>
      o.setName('channels_csv').setDescription('channels.csv').setRequired(false))
    .addStringOption(o =>
      o.setName('mode')
       .setDescription('merge (upsert) or replace (overwrite existing)')
       .addChoices(
         { name: 'merge', value: 'merge' },
         { name: 'replace', value: 'replace' }
       )
       .setRequired(false))
    .addBooleanOption(o =>
      o.setName('public').setDescription('Show this output publicly?').setRequired(false)),
  
  async execute(guildService, interaction) {
    const isOwner = interaction.user.id === interaction.guild.ownerId;
    if (!isOwner) {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      await interaction.editReply('Sorry, only the **server owner** can use this command.');
      return;
    }

    if (!interaction.deferred && !interaction.replied) {
      const isPublic = interaction.options.getBoolean('public') ?? false;
      await interaction.deferReply({ flags: isPublic ? undefined : MessageFlags.Ephemeral }).catch(() => {});
    }

    try {
      // Make sure tables/columns exist
      try { await guildService.createDatabases?.(); } catch {}
      try { await guildService.ensureCharacterExtraColumns?.(); } catch {}
      try { await guildService.init(); } catch {}

      const mode = (interaction.options.getString('mode') || 'merge').toLowerCase();

      // Load attachments
      const attChars = interaction.options.getAttachment('characters_csv');
      const attCfg   = interaction.options.getAttachment('config_csv');
      const attLvls  = interaction.options.getAttachment('levels_csv');
      const attRoles = interaction.options.getAttachment('roles_csv');
      const attChans = interaction.options.getAttachment('channels_csv');

      const charsText = await fetchText(attChars);
      const cfgText   = attCfg   ? await fetchText(attCfg)   : '';
      const lvlsText  = attLvls  ? await fetchText(attLvls)  : '';
      const rolesText = attRoles ? await fetchText(attRoles) : '';
      const chansText = attChans ? await fetchText(attChans) : '';

      // Parse
      const charsRows = csvToObjects(charsText);
      const cfgRows   = cfgText   ? csvToObjects(cfgText)   : [];
      const lvlRows   = lvlsText  ? csvToObjects(lvlsText)  : [];
      const roleRows  = rolesText ? csvToObjects(rolesText) : [];
      const chanRows  = chansText ? csvToObjects(chansText) : [];

      // ---- Import CONFIG (merge/replace -> both just upsert per key) ----
      if (cfgRows.length > 0) {
        const cfgMap = {};
        for (const row of cfgRows) {
          const name = (row.name ?? '').toString();
          const value = (row.value ?? '').toString();
          if (!name) continue;
          cfgMap[name] = value;
        }
        // Keep approveLevel sane (1..20) if provided
        const rawApprove = cfgMap.approveLevel ?? cfgMap.approve_level;
        if (rawApprove !== undefined) {
          const n = parseInt(rawApprove, 10);
          const clamped = Math.max(1, Math.min(20, Number.isFinite(n) ? n : 1));
          cfgMap.approveLevel = String(clamped);
          cfgMap.approve_level = String(clamped);
        }
        await guildService.updateServerConfig(cfgMap);
      }

      // ---- Import LEVELS ----
      if (lvlRows.length > 0) {
        // replace: set each level from CSV; merge: same behavior (upsert by key)
        for (const r of lvlRows) {
          const lvl = parseInt(r.level, 10);
          const xpToNext = parseInt(r.xp_to_next, 10);
          if (!Number.isInteger(lvl) || !Number.isFinite(xpToNext)) continue;
          await guildService.updateLevel(lvl, xpToNext);
        }
      }

      // ---- Import ROLES (XP bonuses) ----
      if (roleRows.length > 0) {
        for (const r of roleRows) {
          const roleId = (r.role_id || '').toString();
          const xpBonus = parseFloat(r.xp_bonus);
          if (!roleId) continue;
          if (Number.isFinite(xpBonus) && xpBonus >= 0) {
            await guildService.updateRole(roleId, xpBonus);
          }
        }
      }

      // ---- Import CHANNELS ----
      if (chanRows.length > 0) {
        for (const r of chanRows) {
          const channelId = (r.channel_id || '').toString();
          const perPost = parseFloat(r.xp_per_post);
          if (!channelId) continue;
          if (Number.isFinite(perPost) && perPost >= 0) {
            await guildService.updateChannel(channelId, perPost);
          }
        }
      }

      // ---- Import CHARACTERS ----
      // Accept both old and new headers. Fallbacks if missing columns.
      let charsImported = 0, charsUpdated = 0, charsSkipped = 0;

      const toInt = (v, def=0) => {
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : def;
      };

      for (const r of charsRows) {
        // Normalize headers (old CSVs may only have a subset)
        const character_id   = (r.character_id || '').toString();
        const character_index= toInt(r.character_index || r.index || r.slot || 1, 1);
        const name           = (r.name || 'Character').toString();
        const sheet_url      = (r.sheet_url || '').toString();
        const picture_url    = (r.picture_url || '').toString();
        const player_id      = (r.player_id || '').toString();
        const xp             = toInt(r.xp || 0, 0);
        const race           = (r.race || '').toString();
        const klass          = (r.class || '').toString();
        const background     = (r.background || '').toString();
        const alignment      = (r.alignment || '').toString();
        const ping_on_award  = toInt(r.ping_on_award ?? 1, 1) ? 1 : 0;

        if (!character_id || !player_id) { charsSkipped++; continue; }

        // Check if exists
        const existing = await guildService.getCharacter(character_id);
        if (existing) {
          if (mode === 'replace') {
            await guildService.deleteCharacter(existing);
            await guildService.insertCharacter({
              character_id, character_index, name, sheet_url, picture_url, player_id, xp,
              race, class: klass, background, alignment
            });
            // Ensure ping flag after insert
            await guildService.setCharacterPing(character_id, ping_on_award === 1);
            charsImported++;
          } else {
            // merge: update fields + xp
            // name/sheet/picture/race/class/background/alignment
            await guildService.updateCharacterInfo({
              character_id, character_index, name, sheet_url, picture_url,
              race, class: klass, background, alignment
            });
            await guildService.setCharacterXP({ character_id, xp }); // absolute set
            await guildService.setCharacterPing(character_id, ping_on_award === 1);
            charsUpdated++;
          }
        } else {
          await guildService.insertCharacter({
            character_id, character_index, name, sheet_url, picture_url, player_id, xp,
            race, class: klass, background, alignment
          });
          await guildService.setCharacterPing(character_id, ping_on_award === 1);
          charsImported++;
        }
      }

      await interaction.editReply(
        `✅ Import complete.\n` +
        `• Characters: +${charsImported} imported, ${charsUpdated} updated, ${charsSkipped} skipped\n` +
        `${cfgRows.length ? `• Config: ${cfgRows.length} keys upserted\n` : ''}` +
        `${lvlRows.length ? `• Levels: ${lvlRows.length} rows processed\n` : ''}` +
        `${roleRows.length ? `• Roles: ${roleRows.length} rows processed\n` : ''}` +
        `${chanRows.length ? `• Channels: ${chanRows.length} rows processed\n` : ''}`
      );
    } catch (e) {
      console.error('[import_data] failed:', e);
      try { await interaction.editReply('Import failed. Check bot logs.'); } catch {}
    }
  }
};
