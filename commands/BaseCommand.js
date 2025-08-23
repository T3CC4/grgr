// commands/BaseCommand.js - Enhanced with new services
const AuthorizationService = require('../services/AuthorizationService');
const ErrorManagementService = require('../services/ErrorManagementService');

class BaseCommand {
    constructor(data, options = {}) {
        this.data = data;
        this.category = options.category || 'Other';
        this.cooldown = options.cooldown || 3;
        this.permissions = options.permissions || [];
        this.requiresHierarchy = options.requiresHierarchy || false;
        this.guildOnly = options.guildOnly !== false; // Default true
        this.ownerOnly = options.ownerOnly || false;
        this.staffOnly = options.staffOnly || false;
        this.requiresDatabase = options.requiresDatabase || false;
        this.channelPermissions = options.channelPermissions || [];
    }

    async executeWithChecks(interaction, services) {
        try {
            // Guild-only command validation
            if (this.guildOnly && !interaction.guild) {
                return interaction.reply({ 
                    content: '❌ This command can only be used in a server!', 
                    ephemeral: true 
                });
            }

            // Owner-only validation
            if (this.ownerOnly && !this.validateOwnerPermissions(interaction.user.id)) {
                return interaction.reply({ 
                    content: '❌ This command is restricted to bot owners only!', 
                    ephemeral: true 
                });
            }

            // Staff-only validation
            if (this.staffOnly && services.staff && !AuthorizationService.validateStaffPermissions(interaction.user.id, services.staff).isStaff) {
                return interaction.reply({ 
                    content: '❌ This command is restricted to staff members only!', 
                    ephemeral: true 
                });
            }

            // Database dependency check
            if (this.requiresDatabase && !services.database) {
                throw new Error('Database service is required but not available');
            }

            // Permission validation using AuthorizationService
            if (this.permissions.length > 0) {
                const hasPermissions = await AuthorizationService.validateModerationPermissions(
                    interaction, 
                    this.permissions
                );
                if (!hasPermissions) return;
            }

            // Channel permission validation
            if (this.channelPermissions.length > 0 && interaction.guild) {
                const botMember = interaction.guild.members.me;
                const hasChannelPermissions = AuthorizationService.validateChannelPermissions(
                    interaction.channel,
                    botMember,
                    this.channelPermissions
                );
                
                if (!hasChannelPermissions) {
                    return interaction.reply({
                        content: `❌ I need the following permissions in this channel: ${this.channelPermissions.join(', ')}`,
                        ephemeral: true
                    });
                }
            }

            // Role hierarchy validation for moderation commands
            if (this.requiresHierarchy) {
                const targetUser = this.extractTargetUser(interaction);
                if (targetUser) {
                    const hierarchyValid = await AuthorizationService.validateRoleHierarchy(
                        interaction, 
                        targetUser
                    );
                    if (!hierarchyValid) return;
                }
            }

            // Cooldown validation using AuthorizationService
            if (!services.cooldowns) {
                services.cooldowns = new Map();
            }

            const cooldownCheck = AuthorizationService.validateCommandCooldown(
                interaction.user.id,
                this.data.name,
                this.cooldown,
                services.cooldowns
            );

            if (cooldownCheck.onCooldown) {
                return interaction.reply({
                    content: `⏰ Please wait ${cooldownCheck.timeLeft} more seconds before using this command again.`,
                    ephemeral: true
                });
            }

            // Execute the actual command
            await this.execute(interaction, services);
            
            // Log successful execution using ErrorManagementService
            this.logCommandExecution(interaction);
            
        } catch (error) {
            ErrorManagementService.logWarning('BaseCommand', `Error in command ${this.data.name}`, {
                user: interaction.user.tag,
                guild: interaction.guild?.name || 'DM',
                error: error.message
            });

            await ErrorManagementService.handleCommandException(interaction, error);
        }
    }

    /**
     * Extract target user from interaction options (for hierarchy checks)
     */
    extractTargetUser(interaction) {
        // Try common option names for target user
        const possibleUserOptions = ['user', 'target', 'member'];
        
        for (const optionName of possibleUserOptions) {
            const user = interaction.options.getUser(optionName);
            if (user) return user;
        }
        
        return null;
    }

    /**
     * Validate owner permissions
     */
    validateOwnerPermissions(userId) {
        const botOwners = process.env.BOT_OWNERS ? process.env.BOT_OWNERS.split(',') : [];
        return botOwners.includes(userId);
    }

    /**
     * Log command execution using ErrorManagementService
     */
    logCommandExecution(interaction) {
        const guildName = interaction.guild ? interaction.guild.name : 'DM';
        const userName = interaction.user.tag;
        const commandName = this.data.name;
        
        ErrorManagementService.logInfo('Command', `${userName} used /${commandName} in ${guildName}`, {
            userId: interaction.user.id,
            guildId: interaction.guild?.id,
            channelId: interaction.channel?.id,
            commandName: commandName,
            category: this.category
        });
    }

    /**
     * Send DM notification to user (with error handling)
     */
    async sendDirectMessage(user, embed) {
        try {
            await user.send({ embeds: [embed] });
            return true;
        } catch (error) {
            ErrorManagementService.logWarning('BaseCommand', `Failed to send DM to ${user.tag}`, {
                userId: user.id,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Log moderation action using ModerationLoggerService
     */
    async logModerationAction(guild, actionType, targetUser, moderator, reason, services, additionalData = {}) {
        try {
            if (services.modLog) {
                await services.modLog.logAction(guild, actionType, targetUser, moderator, reason, additionalData);
            }
            
            // Also log to database if available
            if (services.database && services.database.addModerationAction) {
                await services.database.addModerationAction(
                    guild.id,
                    targetUser.id,
                    moderator.id,
                    actionType,
                    reason,
                    additionalData.duration || null
                );
            }
        } catch (error) {
            ErrorManagementService.logWarning('BaseCommand', 'Failed to log moderation action', {
                guild: guild.name,
                actionType,
                targetUser: targetUser.tag,
                moderator: moderator.tag,
                error: error.message
            });
        }
    }

    /**
     * Validate if user has access to a ticket (for support commands)
     */
    validateTicketAccess(ticket, userId, services) {
        if (!services.staff) return ticket.user_id === userId;
        
        return AuthorizationService.validateTicketAccess(
            ticket, 
            userId, 
            AuthorizationService.validateStaffPermissions(userId, services.staff)
        );
    }

    /**
     * Get guild configuration with error handling
     */
    async getGuildConfig(guildId, services) {
        try {
            if (services.database && services.database.getGuildConfiguration) {
                return await services.database.getGuildConfiguration(guildId);
            } else if (services.database && services.database.getConfig) {
                return await services.database.getConfig(guildId);
            }
            return null;
        } catch (error) {
            ErrorManagementService.handleDatabaseException(error, 'getGuildConfig', { guildId });
            return null;
        }
    }

    /**
     * Save guild configuration with error handling
     */
    async saveGuildConfig(guildId, config, services) {
        try {
            if (services.database && services.database.saveGuildConfiguration) {
                return await services.database.saveGuildConfiguration(guildId, config);
            } else if (services.database && services.database.saveConfig) {
                return await services.database.saveConfig(guildId, config);
            }
            return false;
        } catch (error) {
            ErrorManagementService.handleDatabaseException(error, 'saveGuildConfig', { guildId, config });
            return false;
        }
    }

    /**
     * Rate limit check for intensive commands
     */
    checkRateLimit(userId, commandName, limit = 5, window = 60000, services) {
        if (!services.rateLimits) {
            services.rateLimits = new Map();
        }

        const key = `${userId}-${commandName}`;
        const now = Date.now();
        const userLimits = services.rateLimits.get(key) || [];
        
        // Remove old entries
        const validEntries = userLimits.filter(timestamp => now - timestamp < window);
        
        if (validEntries.length >= limit) {
            const oldestEntry = Math.min(...validEntries);
            const resetTime = oldestEntry + window;
            
            return ErrorManagementService.handleRateLimitError(
                { limit, remaining: 0, resetTime },
                userId
            );
        }
        
        validEntries.push(now);
        services.rateLimits.set(key, validEntries);
        
        return null; // No rate limit hit
    }

    /**
     * Validate input data
     */
    validateInput(field, value, rules) {
        for (const rule of rules) {
            if (rule.type === 'required' && (!value || value === '')) {
                throw ErrorManagementService.handleValidationError(field, 'required', value);
            }
            
            if (rule.type === 'minLength' && value && value.length < rule.value) {
                throw ErrorManagementService.handleValidationError(field, `minimum ${rule.value} characters`, value);
            }
            
            if (rule.type === 'maxLength' && value && value.length > rule.value) {
                throw ErrorManagementService.handleValidationError(field, `maximum ${rule.value} characters`, value);
            }
            
            if (rule.type === 'regex' && value && !rule.pattern.test(value)) {
                throw ErrorManagementService.handleValidationError(field, rule.message || 'invalid format', value);
            }
        }
        
        return true;
    }

    /**
     * Abstract execute method - must be implemented by child classes
     */
    async execute(interaction, services) {
        throw new Error(`Execute method must be implemented in ${this.constructor.name}`);
    }
}

module.exports = BaseCommand;