// services/AuthorizationService.js - Professional authorization validation
const { PermissionFlagsBits } = require('discord.js');

class AuthorizationService {
    /**
     * Validates if user and bot have required moderation permissions
     * @param {CommandInteraction} interaction - Discord interaction object
     * @param {string|string[]} requiredPermissions - Required permissions
     * @returns {boolean} - True if permissions are valid
     */
    static async validateModerationPermissions(interaction, requiredPermissions) {
        const permissionList = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
        
        for (const permission of permissionList) {
            // Validate user permissions
            if (!interaction.member.permissions.has(PermissionFlagsBits[permission])) {
                await interaction.reply({ 
                    content: `❌ You need the **${permission}** permission to use this command!`, 
                    ephemeral: true 
                });
                return false;
            }

            // Validate bot permissions
            if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits[permission])) {
                await interaction.reply({ 
                    content: `❌ I need the **${permission}** permission to execute this command!`, 
                    ephemeral: true 
                });
                return false;
            }
        }
        return true;
    }

    /**
     * Validates role hierarchy for moderation actions
     * @param {CommandInteraction} interaction - Discord interaction object
     * @param {User} targetUser - Target user for moderation action
     * @returns {boolean} - True if hierarchy allows action
     */
    static async validateRoleHierarchy(interaction, targetUser) {
        const targetMember = interaction.guild.members.cache.get(targetUser.id);
        if (!targetMember) return true; // Not in server, allow action

        // Self-targeting validation
        if (targetUser.id === interaction.user.id) {
            await interaction.reply({ 
                content: '❌ You cannot target yourself with this command!', 
                ephemeral: true 
            });
            return false;
        }

        // Bot-targeting validation
        if (targetUser.id === interaction.client.user.id) {
            await interaction.reply({ 
                content: '❌ You cannot target me with this command!', 
                ephemeral: true 
            });
            return false;
        }

        // Server owner validation
        if (targetUser.id === interaction.guild.ownerId) {
            await interaction.reply({ 
                content: '❌ Cannot target the server owner!', 
                ephemeral: true 
            });
            return false;
        }

        // Role hierarchy validation for user
        if (targetMember.roles.highest.position >= interaction.member.roles.highest.position) {
            await interaction.reply({ 
                content: '❌ You cannot target this user! They have a higher or equal role.', 
                ephemeral: true 
            });
            return false;
        }

        // Role hierarchy validation for bot
        if (targetMember.roles.highest.position >= interaction.guild.members.me.roles.highest.position) {
            await interaction.reply({ 
                content: '❌ I cannot target this user! They have a higher or equal role than me.', 
                ephemeral: true 
            });
            return false;
        }

        return true;
    }

    /**
     * Validates dashboard access permissions
     * @param {object} user - Discord user object
     * @param {object} guild - Guild object
     * @returns {boolean} - True if user can manage guild
     */
    static validateDashboardAccess(user, guild) {
        // Check if user is guild owner
        if (guild.owner) return true;
        
        // Check if user has manage server permission
        const manageServerPermission = 0x20; // MANAGE_GUILD permission
        return (guild.permissions & manageServerPermission) === manageServerPermission;
    }

    /**
     * Validates staff permissions for support system
     * @param {string} userId - Discord user ID
     * @param {object} staffConfig - Staff configuration object
     * @returns {object} - Staff role information
     */
    static validateStaffPermissions(userId, staffConfig) {
        if (staffConfig.owners.includes(userId)) {
            return { isStaff: true, role: 'Owner', canManage: true };
        }
        
        if (staffConfig.admins.includes(userId)) {
            return { isStaff: true, role: 'Admin', canManage: true };
        }
        
        if (staffConfig.moderators.includes(userId)) {
            return { isStaff: true, role: 'Moderator', canManage: true };
        }
        
        if (staffConfig.support.includes(userId)) {
            return { isStaff: true, role: 'Support', canManage: false };
        }
        
        return { isStaff: false, role: 'User', canManage: false };
    }

    /**
     * Validates API access with rate limiting consideration
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     * @param {Function} next - Express next function
     */
    static validateAPIAccess(req, res, next) {
        // Add rate limiting headers
        res.header('X-RateLimit-Limit', '100');
        res.header('X-RateLimit-Remaining', '99');
        res.header('X-RateLimit-Reset', Date.now() + 3600000);
        
        // Basic API key validation (if implemented)
        const apiKey = req.headers['x-api-key'];
        if (process.env.API_KEY && apiKey !== process.env.API_KEY) {
            return res.status(401).json({ error: 'Invalid API key' });
        }
        
        next();
    }

    /**
     * Validates channel permissions for bot operations
     * @param {GuildChannel} channel - Discord channel object
     * @param {GuildMember} botMember - Bot's guild member object
     * @param {string[]} requiredPermissions - Array of required permissions
     * @returns {boolean} - True if bot has required permissions in channel
     */
    static validateChannelPermissions(channel, botMember, requiredPermissions) {
        if (!channel || !botMember) return false;
        
        const channelPermissions = channel.permissionsFor(botMember);
        if (!channelPermissions) return false;
        
        return requiredPermissions.every(permission => 
            channelPermissions.has(PermissionFlagsBits[permission])
        );
    }

    /**
     * Validates command cooldown
     * @param {string} userId - Discord user ID
     * @param {string} commandName - Command name
     * @param {number} cooldownSeconds - Cooldown in seconds
     * @param {Map} cooldownMap - Cooldown storage map
     * @returns {object} - Cooldown validation result
     */
    static validateCommandCooldown(userId, commandName, cooldownSeconds, cooldownMap) {
        const cooldownKey = `${userId}-${commandName}`;
        const now = Date.now();
        const cooldownAmount = cooldownSeconds * 1000;
        
        if (cooldownMap.has(cooldownKey)) {
            const expirationTime = cooldownMap.get(cooldownKey) + cooldownAmount;
            
            if (now < expirationTime) {
                const timeLeft = Math.ceil((expirationTime - now) / 1000);
                return {
                    onCooldown: true,
                    timeLeft: timeLeft,
                    expiresAt: Math.round(expirationTime / 1000)
                };
            }
        }
        
        cooldownMap.set(cooldownKey, now);
        setTimeout(() => cooldownMap.delete(cooldownKey), cooldownAmount);
        
        return { onCooldown: false };
    }

    /**
     * Validates ticket access permissions
     * @param {object} ticket - Ticket object from database
     * @param {string} userId - Discord user ID
     * @param {object} staffPermissions - Staff permissions object
     * @returns {boolean} - True if user can access ticket
     */
    static validateTicketAccess(ticket, userId, staffPermissions) {
        // Ticket owner can always access their tickets
        if (ticket.user_id === userId) return true;
        
        // Staff members can access all tickets
        if (staffPermissions.isStaff) return true;
        
        return false;
    }
}

module.exports = AuthorizationService;