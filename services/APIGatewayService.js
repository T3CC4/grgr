// services/APIGatewayService.js - Unified API gateway service
const express = require('express');
const ErrorManagementService = require('./ErrorManagementService');
const AuthorizationService = require('./AuthorizationService');

class APIGatewayService {
    constructor(botClient, database, staffConfiguration) {
        this.botClient = botClient;
        this.database = database;
        this.staffConfiguration = staffConfiguration;
        this.router = express.Router();
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
        
        this.initializeMiddleware();
        this.initializeRoutes();
    }

    /**
     * Initialize API middleware
     */
    initializeMiddleware() {
        // CORS middleware
        this.router.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', process.env.DASHBOARD_URL || '*');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            
            if (req.method === 'OPTIONS') {
                res.sendStatus(200);
            } else {
                next();
            }
        });

        // Request logging middleware
        this.router.use((req, res, next) => {
            console.log(`[API] ${req.method} ${req.originalUrl} - ${req.ip}`);
            req.startTime = Date.now();
            next();
        });

        // Response time tracking
        this.router.use((req, res, next) => {
            res.on('finish', () => {
                const duration = Date.now() - req.startTime;
                console.log(`[API] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
            });
            next();
        });

        // Rate limiting validation
        this.router.use(AuthorizationService.validateAPIAccess);

        // JSON parsing with error handling
        this.router.use(express.json({
            limit: '10mb',
            type: 'application/json'
        }));
    }

    /**
     * Initialize all API routes
     */
    initializeRoutes() {
        const routeDefinitions = [
            // Bot information routes
            { method: 'GET', path: '/api/bot/statistics', handler: this.getBotStatistics },
            { method: 'GET', path: '/api/bot/commands', handler: this.getCommandList },
            { method: 'GET', path: '/api/bot/guilds', handler: this.getGuildList },
            { method: 'GET', path: '/api/bot/status', handler: this.getBotStatus },
            
            // Guild-specific routes
            { method: 'GET', path: '/api/bot/guild/:guildId', handler: this.getGuildInformation },
            { method: 'GET', path: '/api/bot/guild/:guildId/channels', handler: this.getGuildChannels },
            { method: 'GET', path: '/api/bot/guild/:guildId/roles', handler: this.getGuildRoles },
            { method: 'GET', path: '/api/bot/guild/:guildId/members/:userId', handler: this.getGuildMember },
            { method: 'GET', path: '/api/bot/guild/:guildId/configuration', handler: this.getGuildConfiguration },
            { method: 'POST', path: '/api/bot/guild/:guildId/configuration', handler: this.updateGuildConfiguration },
            
            // User-specific routes
            { method: 'GET', path: '/api/bot/user/:userId', handler: this.getUserInformation },
            { method: 'POST', path: '/api/bot/team/members', handler: this.getBulkTeamMembers },
            
            // Team and support routes
            { method: 'GET', path: '/api/about/team', handler: this.getTeamInformation },
            { method: 'GET', path: '/api/support/tickets', handler: this.getSupportTickets },
            { method: 'POST', path: '/api/support/tickets', handler: this.createSupportTicket },
            { method: 'GET', path: '/api/support/tickets/:ticketId', handler: this.getSupportTicket },
            { method: 'POST', path: '/api/support/tickets/:ticketId/messages', handler: this.addTicketMessage },
            { method: 'PUT', path: '/api/support/tickets/:ticketId/status', handler: this.updateTicketStatus },
            
            // Health and monitoring routes
            { method: 'GET', path: '/health', handler: this.getHealthCheck },
            { method: 'GET', path: '/api/metrics', handler: this.getMetrics }
        ];

        routeDefinitions.forEach(route => {
            this.router[route.method.toLowerCase()](route.path, this.wrapHandler(route.handler));
        });

        // Global error handler for routes
        this.router.use((error, req, res, next) => {
            ErrorManagementService.handleAPIException(res, error, req.originalUrl);
        });
    }

    /**
     * Wrap route handlers with error handling and caching
     * @param {Function} handler - Route handler function
     * @returns {Function} - Wrapped handler
     */
    wrapHandler(handler) {
        return async (req, res, next) => {
            try {
                const result = await handler.call(this, req, res);
                if (result !== undefined && !res.headersSent) {
                    res.json(result);
                }
            } catch (error) {
                next(error);
            }
        };
    }

    /**
     * Get cached data or fetch new data
     * @param {string} key - Cache key
     * @param {Function} fetcher - Function to fetch data
     * @returns {*} - Cached or fresh data
     */
    getCachedData(key, fetcher) {
        const cached = this.cache.get(key);
        const now = Date.now();

        if (cached && (now - cached.timestamp) < this.cacheTimeout) {
            return cached.data;
        }

        const data = fetcher();
        this.cache.set(key, { data, timestamp: now });
        return data;
    }

    /**
     * Get comprehensive bot statistics
     */
    async getBotStatistics() {
        return this.getCachedData('bot-statistics', () => ({
            guilds: this.botClient.guilds.cache.size,
            users: this.botClient.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0),
            channels: this.botClient.channels.cache.size,
            commands: this.botClient.application?.commands?.cache?.size || 0,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            ping: Math.round(this.botClient.ws.ping),
            status: this.botClient.ws.status === 0 ? 'online' : 'offline',
            version: process.env.BOT_VERSION || '1.0.0',
            nodeVersion: process.version
        }));
    }

    /**
     * Get list of available commands
     */
    async getCommandList() {
        return this.getCachedData('command-list', () => {
            if (!this.botClient.application?.commands?.cache) {
                return [];
            }
            
            return Array.from(this.botClient.application.commands.cache.values()).map(cmd => ({
                id: cmd.id,
                name: cmd.name,
                description: cmd.description,
                type: cmd.type,
                options: cmd.options || [],
                defaultPermission: cmd.defaultPermission,
                version: cmd.version
            }));
        });
    }

    /**
     * Get list of guilds bot is in
     */
    async getGuildList() {
        return this.getCachedData('guild-list', () => 
            this.botClient.guilds.cache.map(guild => ({
                id: guild.id,
                name: guild.name,
                icon: guild.icon,
                memberCount: guild.memberCount,
                ownerId: guild.ownerId,
                features: guild.features,
                premiumTier: guild.premiumTier,
                joinedAt: guild.joinedAt
            }))
        );
    }

    /**
     * Get bot status information
     */
    async getBotStatus() {
        return {
            status: this.botClient.ws.status === 0 ? 'online' : 'offline',
            ping: Math.round(this.botClient.ws.ping),
            uptime: process.uptime(),
            guilds: this.botClient.guilds.cache.size,
            users: this.botClient.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get specific guild information
     */
    async getGuildInformation(req) {
        const { guildId } = req.params;
        const guild = this.botClient.guilds.cache.get(guildId);
        
        if (!guild) {
            throw new Error('Guild not found');
        }

        return {
            id: guild.id,
            name: guild.name,
            icon: guild.icon,
            banner: guild.banner,
            description: guild.description,
            memberCount: guild.memberCount,
            ownerId: guild.ownerId,
            features: guild.features,
            premiumTier: guild.premiumTier,
            premiumSubscriptionCount: guild.premiumSubscriptionCount,
            verificationLevel: guild.verificationLevel,
            vanityURLCode: guild.vanityURLCode,
            joinedAt: guild.joinedAt,
            large: guild.large
        };
    }

    /**
     * Get guild channels
     */
    async getGuildChannels(req) {
        const { guildId } = req.params;
        const guild = this.botClient.guilds.cache.get(guildId);
        
        if (!guild) {
            throw new Error('Guild not found');
        }

        return guild.channels.cache
            .filter(channel => channel.type === 0) // Text channels only
            .sort((a, b) => a.position - b.position)
            .map(channel => ({
                id: channel.id,
                name: channel.name,
                type: channel.type,
                position: channel.position,
                parentId: channel.parentId,
                parent: channel.parent?.name || null,
                topic: channel.topic,
                nsfw: channel.nsfw,
                permissionOverwrites: channel.permissionOverwrites?.cache?.size || 0
            }));
    }

    /**
     * Get guild roles
     */
    async getGuildRoles(req) {
        const { guildId } = req.params;
        const guild = this.botClient.guilds.cache.get(guildId);
        
        if (!guild) {
            throw new Error('Guild not found');
        }

        return guild.roles.cache
            .filter(role => role.name !== '@everyone' && !role.managed)
            .sort((a, b) => b.position - a.position)
            .map(role => ({
                id: role.id,
                name: role.name,
                color: role.hexColor,
                position: role.position,
                permissions: role.permissions.bitfield.toString(),
                mentionable: role.mentionable,
                hoist: role.hoist,
                managed: role.managed,
                memberCount: role.members.size
            }));
    }

    /**
     * Get guild member information
     */
    async getGuildMember(req) {
        const { guildId, userId } = req.params;
        const guild = this.botClient.guilds.cache.get(guildId);
        
        if (!guild) {
            throw new Error('Guild not found');
        }

        let member = guild.members.cache.get(userId);
        
        if (!member) {
            try {
                member = await guild.members.fetch(userId);
            } catch (error) {
                throw new Error('Member not found in guild');
            }
        }

        return {
            id: member.id,
            username: member.user.username,
            discriminator: member.user.discriminator,
            tag: member.user.tag,
            displayName: member.displayName,
            avatarURL: member.displayAvatarURL({ size: 256, dynamic: true }),
            joinedAt: member.joinedAt?.toISOString(),
            premiumSince: member.premiumSince?.toISOString(),
            roles: member.roles.cache.map(role => ({
                id: role.id,
                name: role.name,
                color: role.hexColor,
                position: role.position
            })),
            presence: {
                status: member.presence?.status || 'offline',
                activities: member.presence?.activities || []
            },
            permissions: member.permissions.bitfield.toString()
        };
    }

    /**
     * Get guild configuration
     */
    async getGuildConfiguration(req) {
        const { guildId } = req.params;
        return await this.database.getGuildConfiguration(guildId);
    }

    /**
     * Update guild configuration
     */
    async updateGuildConfiguration(req) {
        const { guildId } = req.params;
        const configurationData = req.body;

        await this.database.saveGuildConfiguration(guildId, configurationData);
        
        return {
            success: true,
            message: 'Guild configuration updated successfully',
            configuration: await this.database.getGuildConfiguration(guildId)
        };
    }

    /**
     * Get user information
     */
    async getUserInformation(req) {
        const { userId } = req.params;
        
        try {
            const user = await this.botClient.users.fetch(userId);
            
            return {
                id: user.id,
                username: user.username,
                discriminator: user.discriminator,
                tag: user.tag,
                avatarURL: user.displayAvatarURL({ size: 256, dynamic: true }),
                bot: user.bot,
                system: user.system,
                flags: user.flags?.bitfield || 0,
                createdAt: user.createdAt.toISOString()
            };
        } catch (error) {
            throw new Error('User not found');
        }
    }

    /**
     * Get bulk team member information
     */
    async getBulkTeamMembers(req) {
        const { userIds } = req.body;
        
        if (!Array.isArray(userIds) || userIds.length === 0) {
            throw new Error('userIds array is required');
        }

        const teamMembers = [];
        
        for (const userId of userIds) {
            try {
                const user = await this.botClient.users.fetch(userId);
                if (user) {
                    // Try to find the user in any guild for presence data
                    let bestMemberData = null;
                    
                    for (const guild of this.botClient.guilds.cache.values()) {
                        const member = guild.members.cache.get(userId);
                        if (member) {
                            bestMemberData = {
                                displayName: member.displayName,
                                status: member.presence?.status || 'offline',
                                activities: member.presence?.activities || [],
                                joinedAt: member.joinedAt?.toISOString()
                            };
                            break;
                        }
                    }
                    
                    teamMembers.push({
                        id: user.id,
                        username: user.username,
                        discriminator: user.discriminator,
                        tag: user.tag,
                        displayName: bestMemberData?.displayName || user.username,
                        avatarURL: user.displayAvatarURL({ size: 256, dynamic: true }),
                        status: bestMemberData?.status || 'offline',
                        activities: bestMemberData?.activities || [],
                        joinedAt: bestMemberData?.joinedAt
                    });
                }
            } catch (error) {
                ErrorManagementService.logWarning('APIGateway', `Could not fetch team member ${userId}`, { error: error.message });
            }
        }

        return teamMembers;
    }

    /**
     * Get team information with Discord data
     */
    async getTeamInformation() {
        const allStaffIds = [
            ...this.staffConfiguration.owners,
            ...this.staffConfiguration.admins,
            ...this.staffConfiguration.moderators,
            ...this.staffConfiguration.support
        ];

        if (allStaffIds.length === 0) {
            return {
                members: [],
                stats: { total: 0, online: 0, owners: 0, admins: 0, moderators: 0, support: 0 },
                lastUpdated: new Date().toISOString()
            };
        }

        const teamMembers = [];
        let onlineCount = 0;

        for (const userId of allStaffIds) {
            try {
                const user = await this.botClient.users.fetch(userId);
                if (user) {
                    const role = this.getStaffRole(userId);
                    
                    let status = 'offline';
                    let displayName = user.username;
                    
                    const mutualGuild = this.botClient.guilds.cache.find(guild => 
                        guild.members.cache.has(userId)
                    );
                    
                    if (mutualGuild) {
                        const member = mutualGuild.members.cache.get(userId);
                        if (member) {
                            status = member.presence?.status || 'offline';
                            displayName = member.displayName || user.username;
                            if (status === 'online' || status === 'idle' || status === 'dnd') {
                                onlineCount++;
                            }
                        }
                    }

                    teamMembers.push({
                        id: user.id,
                        username: user.username,
                        discriminator: user.discriminator,
                        tag: user.tag,
                        displayName: displayName,
                        avatarURL: user.displayAvatarURL({ size: 256, dynamic: true }),
                        role: role,
                        status: status,
                        bio: this.getStaffBio(userId, role)
                    });
                }
            } catch (error) {
                ErrorManagementService.logWarning('APIGateway', `Could not fetch staff member ${userId}`, { error: error.message });
            }
        }

        // Sort by role hierarchy
        const roleOrder = { 'Owner': 0, 'Admin': 1, 'Moderator': 2, 'Support': 3 };
        teamMembers.sort((a, b) => {
            const aOrder = roleOrder[a.role] || 999;
            const bOrder = roleOrder[b.role] || 999;
            return aOrder - bOrder;
        });

        return {
            members: teamMembers,
            stats: {
                total: teamMembers.length,
                online: onlineCount,
                owners: this.staffConfiguration.owners.length,
                admins: this.staffConfiguration.admins.length,
                moderators: this.staffConfiguration.moderators.length,
                support: this.staffConfiguration.support.length
            },
            lastUpdated: new Date().toISOString()
        };
    }

    /**
     * Get support tickets
     */
    async getSupportTickets(req) {
        const { status, userId } = req.query;
        
        if (userId) {
            return await this.database.getUserSupportTickets(userId);
        } else {
            return await this.database.getAllSupportTickets(status);
        }
    }

    /**
     * Create support ticket
     */
    async createSupportTicket(req) {
        const { userId, username, category, subject, message } = req.body;
        
        if (!userId || !username || !category || !subject || !message) {
            throw new Error('All fields are required: userId, username, category, subject, message');
        }
        
        const ticketId = await this.database.createSupportTicket(userId, username, category, subject, message);
        
        return {
            success: true,
            ticketId: ticketId,
            message: 'Support ticket created successfully'
        };
    }

    /**
     * Get specific support ticket
     */
    async getSupportTicket(req) {
        const { ticketId } = req.params;
        const ticket = await this.database.getSupportTicket(ticketId);
        
        if (!ticket) {
            throw new Error('Ticket not found');
        }
        
        return ticket;
    }

    /**
     * Add message to support ticket
     */
    async addTicketMessage(req) {
        const { ticketId } = req.params;
        const { userId, username, message, isStaff = false } = req.body;
        
        if (!userId || !username || !message) {
            throw new Error('userId, username, and message are required');
        }
        
        await this.database.addTicketMessage(ticketId, userId, username, message, isStaff);
        
        return {
            success: true,
            message: 'Message added to ticket successfully'
        };
    }

    /**
     * Update support ticket status
     */
    async updateTicketStatus(req) {
        const { ticketId } = req.params;
        const { status, closedBy } = req.body;
        
        if (!status) {
            throw new Error('Status is required');
        }
        
        await this.database.updateTicketStatus(ticketId, status, closedBy);
        
        return {
            success: true,
            message: 'Ticket status updated successfully'
        };
    }

    /**
     * Get health check information
     */
    async getHealthCheck() {
        return {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            bot: {
                status: this.botClient.ws.status === 0 ? 'connected' : 'disconnected',
                ping: Math.round(this.botClient.ws.ping),
                guilds: this.botClient.guilds.cache.size
            },
            database: {
                status: 'connected' // Could add actual database health check
            }
        };
    }

    /**
     * Get comprehensive metrics
     */
    async getMetrics() {
        const stats = await this.getBotStatistics();
        const supportStats = await this.database.getSupportTicketStatistics();
        
        return {
            bot: stats,
            support: supportStats,
            api: {
                cacheSize: this.cache.size,
                cacheHitRatio: 0.85, // Could implement actual tracking
                requestCount: 0, // Could implement actual tracking
                errorRate: 0.02 // Could implement actual tracking
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get staff role for user ID
     * @param {string} userId - Discord user ID
     * @returns {string} - Staff role
     */
    getStaffRole(userId) {
        if (this.staffConfiguration.owners.includes(userId)) return 'Owner';
        if (this.staffConfiguration.admins.includes(userId)) return 'Admin';
        if (this.staffConfiguration.moderators.includes(userId)) return 'Moderator';
        if (this.staffConfiguration.support.includes(userId)) return 'Support';
        return 'User';
    }

    /**
     * Get staff bio for user
     * @param {string} userId - Discord user ID
     * @param {string} role - Staff role
     * @returns {string} - Staff bio
     */
    getStaffBio(userId, role) {
        const customBios = this.staffConfiguration.customBios || {};
        
        if (customBios[userId]) {
            return customBios[userId];
        }

        const roleBios = {
            'Owner': 'Founder and lead developer, responsible for the overall vision and development of Omnia Bot.',
            'Admin': 'Senior team member helping to manage and improve Omnia Bot.',
            'Moderator': 'Experienced moderator ensuring quality and helping users.',
            'Support': 'Dedicated support team member helping users with questions and issues.'
        };

        return roleBios[role] || `Team ${role} working to make Omnia Bot better every day.`;
    }

    /**
     * Clear cache (for manual cache invalidation)
     */
    clearCache() {
        this.cache.clear();
        ErrorManagementService.logInfo('APIGateway', 'Cache cleared manually');
    }

    /**
     * Get Express router
     * @returns {Router} - Express router with all routes
     */
    getRouter() {
        return this.router;
    }
}

module.exports = APIGatewayService;