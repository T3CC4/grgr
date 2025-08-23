// framework/AbstractCommand.js - Enterprise command framework
const AuthorizationService = require('../services/AuthorizationService');
const ErrorManagementService = require('../services/ErrorManagementService');

class AbstractCommand {
    /**
     * Base command class for all Discord bot commands
     * @param {SlashCommandBuilder} commandDefinition - Discord.js command builder
     * @param {object} options - Command configuration options
     */
    constructor(commandDefinition, options = {}) {
        this.commandDefinition = commandDefinition;
        this.category = options.category || 'General';
        this.cooldownPeriod = options.cooldown || 3;
        this.requiredPermissions = options.permissions || [];
        this.requiresHierarchyCheck = options.requiresHierarchy || false;
        this.isGuildOnly = options.guildOnly !== false; // Default true
        this.isOwnerOnly = options.ownerOnly || false;
        this.isStaffOnly = options.staffOnly || false;
    }

    /**
     * Main execution method with all validation checks
     * @param {CommandInteraction} interaction - Discord interaction object
     * @param {object} services - Available bot services
     */
    async executeWithValidation(interaction, services) {
        try {
            // Guild-only command validation
            if (this.isGuildOnly && !interaction.guild) {
                return interaction.reply({ 
                    content: '❌ This command can only be used in a server!', 
                    ephemeral: true 
                });
            }

            // Owner-only validation
            if (this.isOwnerOnly && !this.validateOwnerPermissions(interaction.user.id)) {
                return interaction.reply({ 
                    content: '❌ This command is restricted to bot owners only!', 
                    ephemeral: true 
                });
            }

            // Staff-only validation
            if (this.isStaffOnly && !this.validateStaffPermissions(interaction.user.id, services.staff)) {
                return interaction.reply({ 
                    content: '❌ This command is restricted to staff members only!', 
                    ephemeral: true 
                });
            }

            // Permission validation
            if (this.requiredPermissions.length > 0) {
                const hasPermissions = await AuthorizationService.validateModerationPermissions(
                    interaction, 
                    this.requiredPermissions
                );
                if (!hasPermissions) return;
            }

            // Role hierarchy validation for moderation commands
            if (this.requiresHierarchyCheck) {
                const targetUser = this.extractTargetUser(interaction);
                if (targetUser) {
                    const hierarchyValid = await AuthorizationService.validateRoleHierarchy(
                        interaction, 
                        targetUser
                    );
                    if (!hierarchyValid) return;
                }
            }

            // Cooldown validation
            const cooldownCheck = AuthorizationService.validateCommandCooldown(
                interaction.user.id,
                this.commandDefinition.name,
                this.cooldownPeriod,
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
            
            // Log successful execution
            this.logCommandExecution(interaction);
            
        } catch (error) {
            console.error(`❌ Error in command ${this.commandDefinition.name}:`, error);
            await ErrorManagementService.handleCommandException(interaction, error);
        }
    }

    /**
     * Extract target user from interaction options
     * @param {CommandInteraction} interaction - Discord interaction object
     * @returns {User|null} - Target user or null
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
     * @param {string} userId - Discord user ID
     * @returns {boolean} - True if user is bot owner
     */
    validateOwnerPermissions(userId) {
        const botOwners = process.env.BOT_OWNERS ? process.env.BOT_OWNERS.split(',') : [];
        return botOwners.includes(userId);
    }

    /**
     * Validate staff permissions
     * @param {string} userId - Discord user ID
     * @param {object} staffConfig - Staff configuration object
     * @returns {boolean} - True if user is staff member
     */
    validateStaffPermissions(userId, staffConfig) {
        const staffCheck = AuthorizationService.validateStaffPermissions(userId, staffConfig);
        return staffCheck.isStaff;
    }

    /**
     * Log command execution for monitoring
     * @param {CommandInteraction} interaction - Discord interaction object
     */
    logCommandExecution(interaction) {
        const guildName = interaction.guild ? interaction.guild.name : 'DM';
        const userName = interaction.user.tag;
        const commandName = this.commandDefinition.name;
        
        console.log(`✅ [COMMAND] ${userName} used /${commandName} in ${guildName}`);
        
        // Could be extended to log to database or external service
        if (process.env.COMMAND_LOGGING === 'enabled') {
            // Additional logging logic here
        }
    }

    /**
     * Send DM notification to user
     * @param {User} user - Target user
     * @param {MessageEmbed} embed - Embed to send
     * @returns {boolean} - True if DM was sent successfully
     */
    async sendDirectMessage(user, embed) {
        try {
            await user.send({ embeds: [embed] });
            return true;
        } catch (error) {
            console.warn(`Failed to send DM to ${user.tag}:`, error.message);
            return false;
        }
    }

    /**
     * Log moderation action to database and channel
     * @param {Guild} guild - Discord guild object
     * @param {string} actionType - Type of moderation action
     * @param {User} targetUser - Target user
     * @param {User} moderator - Moderating user
     * @param {string} reason - Reason for action
     * @param {object} services - Available bot services
     */
    async logModerationAction(guild, actionType, targetUser, moderator, reason, services) {
        try {
            // Log to database
            if (services.database) {
                await services.database.addModerationAction(
                    guild.id,
                    targetUser.id,
                    moderator.id,
                    actionType,
                    reason
                );
            }

            // Log to moderation log channel if configured
            if (services.moderationLogger) {
                await services.moderationLogger.logAction(
                    guild,
                    actionType,
                    targetUser,
                    moderator,
                    reason
                );
            }
        } catch (error) {
            console.error('Failed to log moderation action:', error);
        }
    }

    /**
     * Get command data for Discord API registration
     * @returns {object} - Command data object
     */
    get data() {
        return this.commandDefinition;
    }

    /**
     * Abstract execute method - must be implemented by child classes
     * @param {CommandInteraction} interaction - Discord interaction object
     * @param {object} services - Available bot services
     */
    async execute(interaction, services) {
        throw new Error(`Execute method must be implemented in ${this.constructor.name}`);
    }
}

module.exports = AbstractCommand;