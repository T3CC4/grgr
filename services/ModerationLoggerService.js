// services/ModerationLoggerService.js - Professional moderation logging service
const { EmbedBuilder } = require('discord.js');

class ModerationLoggerService {
    constructor(database) {
        this.database = database;
        this.actionColors = {
            'BAN': '#DC3545',
            'UNBAN': '#28A745',
            'KICK': '#FD7E14',
            'WARN': '#FFC107',
            'MUTE': '#6C757D',
            'UNMUTE': '#17A2B8',
            'TIMEOUT': '#6F42C1',
            'CLEAR': '#20C997'
        };
        this.actionIcons = {
            'BAN': '🔨',
            'UNBAN': '🔓',
            'KICK': '👢',
            'WARN': '⚠️',
            'MUTE': '🔇',
            'UNMUTE': '🔊',
            'TIMEOUT': '⏰',
            'CLEAR': '🧹'
        };
    }

    /**
     * Log a moderation action to database and channel
     * @param {Guild} guild - Discord guild object
     * @param {string} actionType - Type of moderation action
     * @param {User} targetUser - Target user
     * @param {User} moderator - Moderating user
     * @param {string} reason - Reason for action
     * @param {object} additionalData - Additional action data
     */
    async logAction(guild, actionType, targetUser, moderator, reason, additionalData = {}) {
        try {
            // Log to database
            await this.logToDatabase(guild.id, targetUser.id, moderator.id, actionType, reason, additionalData);
            
            // Log to moderation channel
            await this.logToChannel(guild, actionType, targetUser, moderator, reason, additionalData);
            
            console.log(`[MODERATION] ${actionType} action logged for ${targetUser.tag} in ${guild.name}`);
            
        } catch (error) {
            console.error('Failed to log moderation action:', error);
        }
    }

    /**
     * Log moderation action to database
     * @param {string} guildId - Guild ID
     * @param {string} targetUserId - Target user ID
     * @param {string} moderatorId - Moderator user ID
     * @param {string} actionType - Type of action
     * @param {string} reason - Reason for action
     * @param {object} additionalData - Additional data
     */
    async logToDatabase(guildId, targetUserId, moderatorId, actionType, reason, additionalData) {
        try {
            await this.database.addModerationAction(
                guildId,
                targetUserId,
                moderatorId,
                actionType,
                reason,
                additionalData.duration || null
            );
        } catch (error) {
            console.error('Failed to log to database:', error);
            throw error;
        }
    }

    /**
     * Log moderation action to guild moderation channel
     * @param {Guild} guild - Discord guild object
     * @param {string} actionType - Type of action
     * @param {User} targetUser - Target user
     * @param {User} moderator - Moderating user
     * @param {string} reason - Reason for action
     * @param {object} additionalData - Additional data
     */
    async logToChannel(guild, actionType, targetUser, moderator, reason, additionalData) {
        try {
            const guildConfig = await this.database.getGuildConfiguration(guild.id);
            
            if (!guildConfig.moderation_log_channel) {
                return; // No moderation log channel configured
            }
            
            const logChannel = guild.channels.cache.get(guildConfig.moderation_log_channel);
            if (!logChannel) {
                console.warn(`Moderation log channel ${guildConfig.moderation_log_channel} not found in guild ${guild.name}`);
                return;
            }

            // Check if bot has permission to send messages in the log channel
            const botMember = guild.members.me;
            if (!logChannel.permissionsFor(botMember)?.has(['SendMessages', 'EmbedLinks'])) {
                console.warn(`Bot lacks permissions to send messages in moderation log channel for guild ${guild.name}`);
                return;
            }

            const embed = this.createModerationEmbed(actionType, targetUser, moderator, reason, additionalData);
            await logChannel.send({ embeds: [embed] });
            
        } catch (error) {
            console.error('Failed to send moderation log to channel:', error);
        }
    }

    /**
     * Create moderation log embed
     * @param {string} actionType - Type of action
     * @param {User} targetUser - Target user
     * @param {User} moderator - Moderating user
     * @param {string} reason - Reason for action
     * @param {object} additionalData - Additional data
     * @returns {EmbedBuilder} - Moderation log embed
     */
    createModerationEmbed(actionType, targetUser, moderator, reason, additionalData) {
        const color = this.actionColors[actionType.toUpperCase()] || '#0099FF';
        const icon = this.actionIcons[actionType.toUpperCase()] || '📋';
        
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`${icon} ${actionType.charAt(0).toUpperCase() + actionType.slice(1).toLowerCase()}`)
            .setThumbnail(targetUser.displayAvatarURL({ size: 64 }))
            .addFields(
                {
                    name: '👤 Target User',
                    value: `${targetUser.tag}\n\`${targetUser.id}\``,
                    inline: true
                },
                {
                    name: '👮 Moderator',
                    value: `${moderator.tag}\n\`${moderator.id}\``,
                    inline: true
                },
                {
                    name: '📝 Reason',
                    value: reason || 'No reason provided',
                    inline: false
                }
            )
            .setTimestamp()
            .setFooter({
                text: `Case ID: ${this.generateCaseId()}`,
                iconURL: moderator.displayAvatarURL({ size: 32 })
            });

        // Add additional fields based on action type and data
        if (additionalData.duration) {
            embed.addFields({
                name: '⏰ Duration',
                value: this.formatDuration(additionalData.duration),
                inline: true
            });
        }

        if (additionalData.messageCount) {
            embed.addFields({
                name: '🗑️ Messages Deleted',
                value: additionalData.messageCount.toString(),
                inline: true
            });
        }

        if (additionalData.deletedMessageDays) {
            embed.addFields({
                name: '📅 Message History Deleted',
                value: `${additionalData.deletedMessageDays} day(s)`,
                inline: true
            });
        }

        if (additionalData.previousWarnings) {
            embed.addFields({
                name: '⚠️ Previous Warnings',
                value: additionalData.previousWarnings.toString(),
                inline: true
            });
        }

        if (additionalData.channel) {
            embed.addFields({
                name: '📺 Channel',
                value: `<#${additionalData.channel.id}>`,
                inline: true
            });
        }

        return embed;
    }

    /**
     * Log bulk moderation action (e.g., mass ban, mass kick)
     * @param {Guild} guild - Discord guild object
     * @param {string} actionType - Type of action
     * @param {User[]} targetUsers - Array of target users
     * @param {User} moderator - Moderating user
     * @param {string} reason - Reason for action
     */
    async logBulkAction(guild, actionType, targetUsers, moderator, reason) {
        try {
            // Log each action to database
            for (const targetUser of targetUsers) {
                await this.logToDatabase(guild.id, targetUser.id, moderator.id, actionType, reason);
            }

            // Create bulk log message for channel
            const guildConfig = await this.database.getGuildConfiguration(guild.id);
            
            if (!guildConfig.moderation_log_channel) {
                return;
            }
            
            const logChannel = guild.channels.cache.get(guildConfig.moderation_log_channel);
            if (!logChannel) return;

            const color = this.actionColors[actionType.toUpperCase()] || '#0099FF';
            const icon = this.actionIcons[actionType.toUpperCase()] || '📋';

            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(`${icon} Bulk ${actionType.charAt(0).toUpperCase() + actionType.slice(1).toLowerCase()}`)
                .addFields(
                    {
                        name: '👮 Moderator',
                        value: `${moderator.tag}\n\`${moderator.id}\``,
                        inline: true
                    },
                    {
                        name: '👥 Users Affected',
                        value: targetUsers.length.toString(),
                        inline: true
                    },
                    {
                        name: '📝 Reason',
                        value: reason || 'No reason provided',
                        inline: false
                    }
                )
                .setTimestamp()
                .setFooter({
                    text: `Case ID: ${this.generateCaseId()}`,
                    iconURL: moderator.displayAvatarURL({ size: 32 })
                });

            // Add user list if not too many users
            if (targetUsers.length <= 10) {
                const userList = targetUsers
                    .map(user => `• ${user.tag} \`(${user.id})\``)
                    .join('\n');
                
                embed.addFields({
                    name: '👤 Affected Users',
                    value: userList,
                    inline: false
                });
            }

            await logChannel.send({ embeds: [embed] });
            
        } catch (error) {
            console.error('Failed to log bulk moderation action:', error);
        }
    }

    /**
     * Log automatic moderation action (e.g., automod)
     * @param {Guild} guild - Discord guild object
     * @param {string} actionType - Type of action
     * @param {User} targetUser - Target user
     * @param {string} trigger - What triggered the action
     * @param {object} additionalData - Additional data
     */
    async logAutomaticAction(guild, actionType, targetUser, trigger, additionalData = {}) {
        try {
            // Log to database with 'AUTOMOD' as moderator
            await this.logToDatabase(guild.id, targetUser.id, guild.client.user.id, actionType, `Auto: ${trigger}`, additionalData);

            // Log to channel
            const guildConfig = await this.database.getGuildConfiguration(guild.id);
            
            if (!guildConfig.moderation_log_channel) {
                return;
            }
            
            const logChannel = guild.channels.cache.get(guildConfig.moderation_log_channel);
            if (!logChannel) return;

            const color = this.actionColors[actionType.toUpperCase()] || '#FF6B6B';
            const icon = '🤖';

            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(`${icon} Auto-${actionType.charAt(0).toUpperCase() + actionType.slice(1).toLowerCase()}`)
                .setThumbnail(targetUser.displayAvatarURL({ size: 64 }))
                .addFields(
                    {
                        name: '👤 Target User',
                        value: `${targetUser.tag}\n\`${targetUser.id}\``,
                        inline: true
                    },
                    {
                        name: '🚨 Trigger',
                        value: trigger,
                        inline: true
                    },
                    {
                        name: '🤖 System',
                        value: 'Automatic Moderation',
                        inline: true
                    }
                )
                .setTimestamp()
                .setFooter({
                    text: `Auto-Case ID: ${this.generateCaseId()}`,
                    iconURL: guild.client.user.displayAvatarURL({ size: 32 })
                });

            if (additionalData.content) {
                embed.addFields({
                    name: '💬 Content',
                    value: `\`\`\`${additionalData.content.substring(0, 500)}\`\`\``,
                    inline: false
                });
            }

            await logChannel.send({ embeds: [embed] });
            
        } catch (error) {
            console.error('Failed to log automatic moderation action:', error);
        }
    }

    /**
     * Get moderation history for a user
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     * @param {number} limit - Maximum number of records to return
     * @returns {Array} - Array of moderation actions
     */
    async getUserModerationHistory(guildId, userId, limit = 10) {
        try {
            const actions = await this.database.getModerationActions(guildId, limit);
            return actions.filter(action => action.user_id === userId);
        } catch (error) {
            console.error('Failed to get user moderation history:', error);
            return [];
        }
    }

    /**
     * Get recent moderation actions for a guild
     * @param {string} guildId - Guild ID
     * @param {number} limit - Maximum number of records to return
     * @returns {Array} - Array of recent moderation actions
     */
    async getRecentModerationActions(guildId, limit = 50) {
        try {
            return await this.database.getModerationActions(guildId, limit);
        } catch (error) {
            console.error('Failed to get recent moderation actions:', error);
            return [];
        }
    }

    /**
     * Generate unique case ID for moderation action
     * @returns {string} - Unique case ID
     */
    generateCaseId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        return `${timestamp}-${random}`.toUpperCase();
    }

    /**
     * Format duration string
     * @param {number} milliseconds - Duration in milliseconds
     * @returns {string} - Formatted duration string
     */
    formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days}d ${hours % 24}h ${minutes % 60}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * Get moderation statistics for a guild
     * @param {string} guildId - Guild ID
     * @param {number} days - Number of days to look back
     * @returns {object} - Moderation statistics
     */
    async getModerationStatistics(guildId, days = 30) {
        try {
            const cutoffDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
            const allActions = await this.database.getModerationActions(guildId, 1000);
            
            const recentActions = allActions.filter(action => 
                new Date(action.created_at) > cutoffDate
            );

            const statistics = {
                total: recentActions.length,
                byType: {},
                byModerator: {},
                dailyAverage: Math.round(recentActions.length / days)
            };

            // Count actions by type
            recentActions.forEach(action => {
                statistics.byType[action.action_type] = (statistics.byType[action.action_type] || 0) + 1;
                statistics.byModerator[action.moderator_id] = (statistics.byModerator[action.moderator_id] || 0) + 1;
            });

            return statistics;
        } catch (error) {
            console.error('Failed to get moderation statistics:', error);
            return {
                total: 0,
                byType: {},
                byModerator: {},
                dailyAverage: 0
            };
        }
    }

    /**
     * Check if moderation logging is properly configured for a guild
     * @param {Guild} guild - Discord guild object
     * @returns {object} - Configuration status
     */
    async checkConfiguration(guild) {
        try {
            const guildConfig = await this.database.getGuildConfiguration(guild.id);
            
            const status = {
                hasLogChannel: !!guildConfig.moderation_log_channel,
                channelExists: false,
                botHasPermissions: false,
                channelId: guildConfig.moderation_log_channel
            };

            if (status.hasLogChannel) {
                const logChannel = guild.channels.cache.get(guildConfig.moderation_log_channel);
                status.channelExists = !!logChannel;

                if (status.channelExists) {
                    const botMember = guild.members.me;
                    const permissions = logChannel.permissionsFor(botMember);
                    status.botHasPermissions = permissions?.has(['SendMessages', 'EmbedLinks']) || false;
                }
            }

            return status;
        } catch (error) {
            console.error('Failed to check moderation logging configuration:', error);
            return {
                hasLogChannel: false,
                channelExists: false,
                botHasPermissions: false,
                channelId: null
            };
        }
    }
}

module.exports = ModerationLoggerService;