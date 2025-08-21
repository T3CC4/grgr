const { EmbedBuilder } = require('discord.js');
const database = require('../database/database');

async function logModAction(guild, action, user, moderator, reason, duration = null) {
    const config = await database.getGuildConfig(guild.id);
    
    if (!config.mod_log_channel) return;
    
    const channel = guild.channels.cache.get(config.mod_log_channel);
    if (!channel) return;
    
    await database.addModLog(
        guild.id,
        user.id,
        moderator.id,
        action,
        reason,
        duration
    );
    
    const embed = new EmbedBuilder()
        .setColor(getActionColor(action))
        .setTitle(`🔨 ${action}`)
        .addFields(
            { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
            { name: 'Moderator', value: moderator.tag, inline: true },
            { name: 'Grund', value: reason || 'Kein Grund angegeben' }
        )
        .setTimestamp();
        
    if (duration) {
        embed.addFields({ name: 'Dauer', value: duration });
    }
    
    await channel.send({ embeds: [embed] });
}

function getActionColor(action) {
    const colors = {
        'BAN': '#DC3545',
        'KICK': '#FFA500',
        'WARN': '#FFD700',
        'MUTE': '#6C757D',
        'UNBAN': '#28A745'
    };
    return colors[action] || '#0099FF';
}

module.exports = { logModAction };