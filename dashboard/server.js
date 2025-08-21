// dashboard/server.js - FIXED with proper variable passing
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const axios = require('axios');
const database = require('../database/database');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session Configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-here',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
    }
}));

// Flash messages middleware
app.use((req, res, next) => {
    res.locals.message = req.session.message || null;
    res.locals.messageType = req.session.messageType || 'info';
    delete req.session.message;
    delete req.session.messageType;
    next();
});

// Passport Configuration
app.use(passport.initialize());
app.use(passport.session());

passport.use(new DiscordStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: `${process.env.DASHBOARD_URL || 'http://localhost:3000'}/auth/discord/callback`,
    scope: ['identify', 'guilds']
}, async (accessToken, refreshToken, profile, done) => {
    profile.accessToken = accessToken;
    return done(null, profile);
}));

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((user, done) => {
    done(null, user);
});

// Auth Middleware
const requireAuth = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/auth/discord');
};

// Helper Functions
const hasManageGuildPermission = (guild) => {
    return (guild.permissions & 0x20) === 0x20 || guild.owner;
};

// Bot API URL
const BOT_API_URL = `http://localhost:${process.env.BOT_API_PORT || 3001}`;

const getBotGuilds = async () => {
    try {
        const response = await axios.get(`${BOT_API_URL}/api/bot/guilds`);
        return response.data;
    } catch (error) {
        console.error('Error fetching bot guilds:', error.message);
        return [];
    }
};

// Get available commands from bot
const getBotCommands = async () => {
    try {
        const response = await axios.get(`${BOT_API_URL}/api/bot/commands`);
        return response.data;
    } catch (error) {
        console.error('Error fetching bot commands:', error.message);
        return [];
    }
};

// Routes
app.get('/', (req, res) => {
    res.render('index', { 
        user: req.user,
        botInviteURL: `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=8&scope=bot%20applications.commands`,
        message: res.locals.message,
        messageType: res.locals.messageType
    });
});

app.get('/dashboard', requireAuth, async (req, res) => {
    try {
        const userGuilds = req.user.guilds.filter(guild => hasManageGuildPermission(guild));
        const botGuilds = await getBotGuilds();
        
        const guildsWithBotStatus = userGuilds.map(guild => ({
            ...guild,
            botInGuild: botGuilds.some(botGuild => botGuild.id === guild.id)
        }));

        // Get total member count
        const totalMembers = botGuilds.reduce((acc, guild) => acc + (guild.memberCount || 0), 0);

        res.render('dashboard', { 
            user: req.user, 
            guilds: guildsWithBotStatus,
            botGuilds: botGuilds.length,
            totalMembers: totalMembers,
            botInviteURL: `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=8&scope=bot%20applications.commands&guild_id=`,
            message: res.locals.message,
            messageType: res.locals.messageType
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).render('error', { 
            error: 'Error loading dashboard',
            user: req.user,
            message: null,
            messageType: 'danger'
        });
    }
});

app.get('/dashboard/:guildId', requireAuth, async (req, res) => {
    const guildId = req.params.guildId;
    
    try {
        const userGuild = req.user.guilds.find(guild => guild.id === guildId);
        
        if (!userGuild || !hasManageGuildPermission(userGuild)) {
            return res.status(403).render('error', { 
                error: 'You don\'t have permission to manage this server!',
                user: req.user,
                message: null,
                messageType: 'danger'
            });
        }

        // Check if bot is in guild
        const botGuilds = await getBotGuilds();
        if (!botGuilds.some(g => g.id === guildId)) {
            return res.status(403).render('error', { 
                error: 'The bot is not in this server! Please add it first.',
                user: req.user,
                message: null,
                messageType: 'danger'
            });
        }

        // Load guild configuration from database
        const guildConfig = await database.getGuildConfig(guildId);
        
        // Get available commands
        const commands = await getBotCommands();

        res.render('guild-dashboard', { 
            user: req.user, 
            guild: userGuild,
            commands: commands,
            config: {
                guildId: guildConfig.guild_id,
                prefix: guildConfig.prefix || '!',
                welcomeChannel: guildConfig.welcome_channel,
                welcomeMessage: guildConfig.welcome_message || 'Welcome {user} to {server}!',
                modLogChannel: guildConfig.mod_log_channel,
                autoRole: guildConfig.auto_role,
                musicEnabled: Boolean(guildConfig.music_enabled),
                moderationEnabled: Boolean(guildConfig.moderation_enabled)
            },
            section: req.query.section || 'general',
            activeSection: req.query.section || 'general',
            message: res.locals.message,
            messageType: res.locals.messageType
        });
    } catch (error) {
        console.error('Guild dashboard error:', error);
        res.status(500).render('error', { 
            error: 'Error loading guild settings',
            user: req.user,
            message: null,
            messageType: 'danger'
        });
    }
});

// API Routes for AJAX Requests
app.post('/api/guild/:guildId/config', requireAuth, async (req, res) => {
    const guildId = req.params.guildId;
    const config = req.body;
    
    try {
        const userGuild = req.user.guilds.find(guild => guild.id === guildId);
        
        if (!userGuild || !hasManageGuildPermission(userGuild)) {
            return res.status(403).json({ error: 'No permission' });
        }

        // Save configuration to database
        await database.saveGuildConfig(guildId, {
            prefix: config.prefix || '!',
            welcomeChannel: config.welcomeChannel || null,
            welcomeMessage: config.welcomeMessage || 'Welcome {user} to {server}!',
            modLogChannel: config.modLogChannel || null,
            autoRole: config.autoRole || null,
            musicEnabled: config.musicEnabled === true || config.musicEnabled === 'true' || config.musicEnabled === 1,
            moderationEnabled: config.moderationEnabled === true || config.moderationEnabled === 'true' || config.moderationEnabled === 1
        });
        
        res.json({ success: true, message: 'Configuration saved successfully!' });
    } catch (error) {
        console.error('Config save error:', error);
        res.status(500).json({ error: 'Error saving configuration: ' + error.message });
    }
});

app.get('/api/guild/:guildId/channels', requireAuth, async (req, res) => {
    const guildId = req.params.guildId;
    
    try {
        const userGuild = req.user.guilds.find(guild => guild.id === guildId);
        
        if (!userGuild || !hasManageGuildPermission(userGuild)) {
            return res.status(403).json({ error: 'No permission' });
        }

        // Get channels from Bot API
        const response = await axios.get(`${BOT_API_URL}/api/bot/guild/${guildId}/channels`);
        res.json(response.data);
    } catch (error) {
        console.error('Channels fetch error:', error);
        res.status(500).json({ error: 'Error loading channels' });
    }
});

app.get('/api/guild/:guildId/roles', requireAuth, async (req, res) => {
    const guildId = req.params.guildId;
    
    try {
        const userGuild = req.user.guilds.find(guild => guild.id === guildId);
        
        if (!userGuild || !hasManageGuildPermission(userGuild)) {
            return res.status(403).json({ error: 'No permission' });
        }

        // Get roles from Bot API
        const response = await axios.get(`${BOT_API_URL}/api/bot/guild/${guildId}/roles`);
        res.json(response.data);
    } catch (error) {
        console.error('Roles fetch error:', error);
        res.status(500).json({ error: 'Error loading roles' });
    }
});

// Stats API
app.get('/api/guild/:guildId/stats', requireAuth, async (req, res) => {
    const guildId = req.params.guildId;
    
    try {
        const userGuild = req.user.guilds.find(guild => guild.id === guildId);
        
        if (!userGuild || !hasManageGuildPermission(userGuild)) {
            return res.status(403).json({ error: 'No permission' });
        }

        // Get stats from database
        const modLogs = await database.getModLogs(guildId, 10);
        const customCommands = await database.getCustomCommands(guildId);
        
        res.json({
            modLogs: modLogs.length,
            customCommands: customCommands.length,
            recentActions: modLogs
        });
    } catch (error) {
        console.error('Stats fetch error:', error);
        res.status(500).json({ error: 'Error loading statistics' });
    }
});

// Commands API - Get enabled/disabled commands
app.get('/api/guild/:guildId/commands', requireAuth, async (req, res) => {
    const guildId = req.params.guildId;
    
    try {
        // Get command settings from database (you might need to add this table)
        const commands = await getBotCommands();
        res.json(commands);
    } catch (error) {
        console.error('Commands fetch error:', error);
        res.status(500).json({ error: 'Error loading commands' });
    }
});

// Toggle command for guild
app.post('/api/guild/:guildId/commands/:commandName/toggle', requireAuth, async (req, res) => {
    const { guildId, commandName } = req.params;
    const { enabled } = req.body;
    
    try {
        // Save to database (you might need to add this functionality)
        res.json({ success: true, message: `Command ${enabled ? 'enabled' : 'disabled'}` });
    } catch (error) {
        console.error('Command toggle error:', error);
        res.status(500).json({ error: 'Error toggling command' });
    }
});

// Custom Commands API
app.get('/api/guild/:guildId/custom-commands', requireAuth, async (req, res) => {
    const guildId = req.params.guildId;
    
    try {
        const commands = await database.getCustomCommands(guildId);
        res.json(commands);
    } catch (error) {
        console.error('Custom commands fetch error:', error);
        res.status(500).json({ error: 'Error loading custom commands' });
    }
});

app.post('/api/guild/:guildId/custom-commands', requireAuth, async (req, res) => {
    const guildId = req.params.guildId;
    const { commandName, response } = req.body;
    
    try {
        await database.addCustomCommand(guildId, commandName, response, req.user.id);
        res.json({ success: true, message: 'Custom command added!' });
    } catch (error) {
        console.error('Custom command add error:', error);
        res.status(500).json({ error: 'Error adding custom command' });
    }
});

app.delete('/api/guild/:guildId/custom-commands/:commandName', requireAuth, async (req, res) => {
    const guildId = req.params.guildId;
    const commandName = req.params.commandName;
    
    try {
        await database.removeCustomCommand(guildId, commandName);
        res.json({ success: true, message: 'Custom command deleted!' });
    } catch (error) {
        console.error('Custom command delete error:', error);
        res.status(500).json({ error: 'Error deleting custom command' });
    }
});

// Auth Routes
app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback', 
    passport.authenticate('discord', { failureRedirect: '/' }), 
    (req, res) => {
        req.session.message = 'Successfully logged in!';
        req.session.messageType = 'success';
        res.redirect('/dashboard');
    }
);

app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) console.error('Logout error:', err);
        req.session.message = 'Successfully logged out!';
        req.session.messageType = 'info';
        res.redirect('/');
    });
});

// Error Handler
app.use((req, res) => {
    res.status(404).render('error', { 
        error: 'Page not found',
        user: req.user,
        message: null,
        messageType: 'warning'
    });
});

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).render('error', { 
        error: 'Internal server error',
        user: req.user,
        message: null,
        messageType: 'danger'
    });
});

const PORT = process.env.DASHBOARD_PORT || 3000;
app.listen(PORT, () => {
    console.log(`🌐 Dashboard running on http://localhost:${PORT}`);
});