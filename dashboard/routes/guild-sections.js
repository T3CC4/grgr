// dashboard/routes/guild-sections.js - FIXED with proper export
const express = require('express');
const router = express.Router();
const path = require('path');

// Try to load database
let database;
try {
    database = require('../../database/database');
} catch (error) {
    console.log('⚠️ Database not found in guild-sections route');
    // Fallback database
    database = {
        getGuildConfig: async (guildId) => ({
            guild_id: guildId,
            prefix: '!',
            welcome_channel: null,
            welcome_message: 'Welcome {user} to {server}!',
            leave_message: '{user} has left the server',
            mod_log_channel: null,
            auto_role: null,
            music_enabled: true,
            moderation_enabled: true
        })
    };
}

const axios = require('axios');

// Auth middleware
const requireAuth = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/auth/discord');
};

// Helper to check permissions
const hasManageGuildPermission = (guild) => {
    return (guild.permissions & 0x20) === 0x20 || guild.owner;
};

// Bot API URL
const BOT_API_URL = `http://localhost:${process.env.BOT_API_PORT || 3001}`;

// Get bot commands
const getBotCommands = async () => {
    try {
        const response = await axios.get(`${BOT_API_URL}/api/bot/commands`);
        return response.data;
    } catch (error) {
        console.error('Error fetching bot commands:', error.message);
        return [];
    }
};

// Guild dashboard sections route
router.get('/dashboard/:guildId/:section', requireAuth, async (req, res) => {
    const { guildId, section } = req.params;
    
    try {
        // Check permissions
        const userGuild = req.user.guilds.find(guild => guild.id === guildId);
        
        if (!userGuild || !hasManageGuildPermission(userGuild)) {
            return res.status(403).render('error', { 
                error: 'You don\'t have permission to manage this server!',
                user: req.user,
                message: null,
                messageType: 'danger'
            });
        }

        // Load guild configuration
        const guildConfig = await database.getGuildConfig(guildId);
        
        // Get commands if needed
        let commands = [];
        if (section === 'commands') {
            commands = await getBotCommands();
        }

        // Prepare config object
        const config = {
            guildId: guildConfig.guild_id,
            prefix: guildConfig.prefix || '!',
            welcomeChannel: guildConfig.welcome_channel,
            welcomeMessage: guildConfig.welcome_message || 'Welcome {user} to {server}!',
            leaveMessage: guildConfig.leave_message || '{user} has left the server',
            modLogChannel: guildConfig.mod_log_channel,
            autoRole: guildConfig.auto_role,
            musicEnabled: Boolean(guildConfig.music_enabled),
            moderationEnabled: Boolean(guildConfig.moderation_enabled)
        };

        // Check which view to use
        const fs = require('fs');
        const viewsPath = path.join(__dirname, '..', 'views');
        const hasSectionView = fs.existsSync(path.join(viewsPath, 'guild-dashboard-section.ejs'));
        
        if (!hasSectionView) {
            // If guild-dashboard-section doesn't exist, use guild-dashboard with section parameter
            return res.render('guild-dashboard', { 
                user: req.user, 
                guild: userGuild,
                commands: commands,
                config: config,
                section: section,
                activeSection: section,
                message: res.locals.message,
                messageType: res.locals.messageType
            });
        }

        // Render the guild dashboard section view
        res.render('guild-dashboard-section', { 
            user: req.user, 
            guild: userGuild,
            commands: commands,
            config: config,
            section: section,
            activeSection: section,
            message: res.locals.message,
            messageType: res.locals.messageType
        });
    } catch (error) {
        console.error('Guild section error:', error);
        res.status(500).render('error', { 
            error: 'Error loading guild settings',
            user: req.user,
            message: null,
            messageType: 'danger'
        });
    }
});

module.exports = router;