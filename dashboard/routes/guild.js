// routes/guild.js - Unified Guild Management
const express = require('express');
const router = express.Router();

class GuildController {
    constructor(database, botAPI) {
        this.database = database;
        this.botAPI = botAPI;
    }

    // Middleware für Guild-Berechtigung
    async checkGuildAccess(req, res, next) {
        const { guildId } = req.params;
        const userGuild = req.user.guilds.find(g => g.id === guildId);
        
        if (!userGuild || !this.hasManagePermission(userGuild)) {
            return res.status(403).json({ error: 'No permission' });
        }
        
        req.userGuild = userGuild;
        next();
    }

    hasManagePermission(guild) {
        return (guild.permissions & 0x20) === 0x20 || guild.owner;
    }

    // Main dashboard route
    async renderDashboard(req, res) {
        const { guildId, section = 'general' } = req.params;
        
        try {
            const [config, commands, botGuilds] = await Promise.all([
                this.database.getGuildConfig(guildId),
                this.botAPI.getCommands(),
                this.botAPI.getGuilds()
            ]);

            if (!botGuilds.some(g => g.id === guildId)) {
                return res.status(403).render('error', { 
                    error: 'Bot not in server',
                    user: req.user 
                });
            }

            res.render('guild-dashboard', {
                user: req.user,
                guild: req.userGuild,
                config: this.normalizeConfig(config),
                commands,
                section,
                activeSection: section
            });
        } catch (error) {
            res.status(500).render('error', { 
                error: 'Failed to load dashboard',
                user: req.user 
            });
        }
    }

    normalizeConfig(config) {
        return {
            guildId: config.guild_id,
            prefix: config.prefix || '!',
            welcomeChannel: config.welcome_channel,
            welcomeMessage: config.welcome_message || 'Welcome {user} to {server}!',
            modLogChannel: config.mod_log_channel,
            autoRole: config.auto_role,
            musicEnabled: Boolean(config.music_enabled),
            moderationEnabled: Boolean(config.moderation_enabled)
        };
    }
}

// Setup routes
function setupGuildRoutes(database, botAPI, ticketService, staff) {
    const controller = new GuildController(database, botAPI);
    
    // Apply middleware
    router.use('/dashboard/:guildId*', controller.checkGuildAccess.bind(controller));
    
    // Main routes
    router.get('/dashboard/:guildId/:section?', controller.renderDashboard.bind(controller));
    
    // Ticket routes (consolidated from dashboard/routes/tickets.js)
    setupTicketRoutes(router, ticketService, staff);
    
    return router;
}

// Ticket routes integration
function setupTicketRoutes(router, ticketService, staff) {
    const requireAuth = (req, res, next) => {
        if (req.isAuthenticated()) return next();
        res.redirect('/auth/discord');
    };

    const requireStaff = (req, res, next) => {
        if (req.isAuthenticated() && staff.isStaff(req.user.id)) return next();
        res.status(403).render('error', { error: 'Staff only', user: req.user });
    };

    // Support page
    router.get('/support', requireAuth, async (req, res) => {
        try {
            const userTickets = await ticketService.getUserTickets(req.user.id);
            const isStaff = staff.isStaff(req.user.id);
            let allTickets = [];
            let stats = null;
            
            if (isStaff) {
                allTickets = await ticketService.getAllTickets();
                stats = await ticketService.getStats();
            }
            
            res.render('support', {
                user: req.user,
                userTickets,
                allTickets,
                isStaff,
                canManage: staff.canManageTickets(req.user.id),
                role: staff.getRole(req.user.id),
                roleColor: staff.getRoleColor(req.user.id),
                stats
            });
        } catch (error) {
            res.status(500).render('error', { error: 'Error loading support', user: req.user });
        }
    });

    // Create ticket
    router.post('/support/ticket/create', requireAuth, async (req, res) => {
        try {
            const { category, subject, message } = req.body;
            
            if (!category || !subject || !message) {
                return res.status(400).json({ error: 'All fields required' });
            }
            
            const ticketId = await ticketService.createTicket(
                req.user.id, req.user.username, category, subject, message
            );
            
            res.json({ success: true, ticketId });
        } catch (error) {
            res.status(500).json({ error: 'Failed to create ticket' });
        }
    });

    // View ticket
    router.get('/support/ticket/:ticketId', requireAuth, async (req, res) => {
        try {
            const ticket = await ticketService.getTicket(req.params.ticketId);
            
            if (!ticket) {
                return res.status(404).render('error', { error: 'Ticket not found', user: req.user });
            }
            
            const isStaff = staff.isStaff(req.user.id);
            if (ticket.user_id !== req.user.id && !isStaff) {
                return res.status(403).render('error', { error: 'Access denied', user: req.user });
            }
            
            res.render('ticket', {
                user: req.user,
                ticket,
                isStaff,
                canManage: staff.canManageTickets(req.user.id),
                role: staff.getRole(req.user.id),
                roleColor: staff.getRoleColor(req.user.id)
            });
        } catch (error) {
            res.status(500).render('error', { error: 'Error loading ticket', user: req.user });
        }
    });

    // Add message
    router.post('/support/ticket/:ticketId/message', requireAuth, async (req, res) => {
        try {
            const { message } = req.body;
            const ticket = await ticketService.getTicket(req.params.ticketId);
            
            if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
            
            const isStaff = staff.isStaff(req.user.id);
            if (ticket.user_id !== req.user.id && !isStaff) {
                return res.status(403).json({ error: 'Access denied' });
            }
            
            await ticketService.addMessage(req.params.ticketId, req.user.id, req.user.username, message, isStaff);
            
            if (isStaff && ticket.status === 'open') {
                await ticketService.updateTicketStatus(req.params.ticketId, 'in_progress');
            }
            
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: 'Failed to add message' });
        }
    });

    // Staff-only routes
    router.post('/support/ticket/:ticketId/status', requireStaff, async (req, res) => {
        try {
            const { status } = req.body;
            const closedBy = status === 'closed' ? req.user.id : null;
            await ticketService.updateTicketStatus(req.params.ticketId, status, closedBy);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: 'Failed to update status' });
        }
    });

    router.post('/support/ticket/:ticketId/assign', requireStaff, async (req, res) => {
        try {
            const { staffId } = req.body;
            await ticketService.assignTicket(req.params.ticketId, staffId);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: 'Failed to assign ticket' });
        }
    });

    router.post('/support/ticket/:ticketId/priority', requireStaff, async (req, res) => {
        try {
            const { priority } = req.body;
            await ticketService.updatePriority(req.params.ticketId, priority);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: 'Failed to update priority' });
        }
    });
}

module.exports = setupGuildRoutes;