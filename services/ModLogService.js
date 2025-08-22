// services/ModLogService.js - Replaces utils/modLog.js
const { EmbedBuilder } = require('discord.js');

class ModLogService {
    constructor(database) {
        this.database = database;
    }

    async logAction(guild, action, user, moderator, reason, duration = null) {
        // Save to database
        await this.database.addModLog(
            guild.id,
            user.id,
            moderator.id,
            action,
            reason,
            duration
        );

        // Send to mod log channel if configured
        await this.sendToChannel(guild, action, user, moderator, reason, duration);
    }

    async sendToChannel(guild, action, user, moderator, reason, duration = null) {
        try {
            const config = await this.database.getConfig(guild.id);
            
            if (!config.mod_log_channel) return;
            
            const channel = guild.channels.cache.get(config.mod_log_channel);
            if (!channel) return;

            const embed = new EmbedBuilder()
                .setColor(this.getActionColor(action))
                .setTitle(`🔨 ${action.toUpperCase()}`)
                .addFields(
                    { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                    { name: 'Moderator', value: moderator.tag, inline: true },
                    { name: 'Reason', value: reason || 'No reason provided' }
                )
                .setTimestamp();
                
            if (duration) {
                embed.addFields({ name: 'Duration', value: duration });
            }
            
            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Failed to send mod log:', error);
        }
    }

    getActionColor(action) {
        const colors = {
            'BAN': '#DC3545',
            'KICK': '#FFA500', 
            'WARN': '#FFD700',
            'MUTE': '#6C757D',
            'UNBAN': '#28A745'
        };
        return colors[action.toUpperCase()] || '#0099FF';
    }
}

module.exports = ModLogService;