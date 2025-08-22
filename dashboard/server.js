// dashboard/server.js - COMPLETE FIXED VERSION
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

const app = express();

// Initialize database
let database;
try {
    database = require('../database/database');
} catch (error) {
    console.log('⚠️ Database module not found, using stub...');
    database = {
        getGuildConfig: async (guildId) => ({
            guild_id: guildId,
            prefix: '!',
            welcome_channel: null,
            welcome_message: 'Welcome {user} to {server}!',
            mod_log_channel: null,
            auto_role: null,
            music_enabled: true,
            moderation_enabled: true
        }),
        saveGuildConfig: async () => true
    };
}

const routesPath = path.join(__dirname, 'routes');
if (!fs.existsSync(routesPath)) {
    fs.mkdirSync(routesPath, { recursive: true });
    console.log('✅ Created routes directory');
}

// Initialize routes - with error handling
let ticketRoutes;
const ticketsPath = path.join(routesPath, 'tickets.js');
if (fs.existsSync(ticketsPath)) {
    try {
        ticketRoutes = require('./routes/tickets');
        console.log('✅ Loaded ticket routes');
    } catch (error) {
        console.error('❌ Error loading ticket routes:', error.message);
        ticketRoutes = null;
    }
} else {
    console.log('⚠️ Ticket routes file not found, creating stub...');
    ticketRoutes = null;
}

let guildSectionRoutes;
const guildSectionsPath = path.join(routesPath, 'guild-sections.js');
if (fs.existsSync(guildSectionsPath)) {
    try {
        guildSectionRoutes = require('./routes/guild-sections');
        console.log('✅ Loaded guild section routes');
    } catch (error) {
        console.error('❌ Error loading guild section routes:', error.message);
        guildSectionRoutes = null;
    }
} else {
    console.log('⚠️ Guild sections routes file not found, creating stub...');
    guildSectionRoutes = null;
}


let staff;
try {
    staff = require('../config/staff');
} catch (error) {
    console.log('⚠️ Staff config not found, creating default...');
    // Create the config directory if it doesn't exist
    const configPath = path.join(__dirname, '..', 'config');
    if (!fs.existsSync(configPath)) {
        fs.mkdirSync(configPath, { recursive: true });
    }
    
    // Default staff config
    staff = {
        owners: ['YOUR_DISCORD_ID_HERE'],
        admins: [],
        moderators: [],
        support: [],
        isStaff: (userId) => false,
        canManageTickets: (userId) => false,
        isAdmin: (userId) => false,
        getRole: (userId) => 'User',
        getRoleColor: (userId) => 'secondary'
    };
    
    // Write default config file
    const staffConfigContent = `// config/staff.js
module.exports = {
    owners: ['YOUR_DISCORD_ID_HERE'], // Replace with your Discord ID
    admins: [],
    moderators: [],
    support: [],
    isStaff(userId) {
        return this.owners.includes(userId) || 
               this.admins.includes(userId) || 
               this.moderators.includes(userId) || 
               this.support.includes(userId);
    },
    canManageTickets(userId) {
        return this.owners.includes(userId) || 
               this.admins.includes(userId) || 
               this.moderators.includes(userId);
    },
    isAdmin(userId) {
        return this.owners.includes(userId) || this.admins.includes(userId);
    },
    getRole(userId) {
        if (this.owners.includes(userId)) return 'Owner';
        if (this.admins.includes(userId)) return 'Admin';
        if (this.moderators.includes(userId)) return 'Moderator';
        if (this.support.includes(userId)) return 'Support';
        return 'User';
    },
    getRoleColor(userId) {
        if (this.owners.includes(userId)) return 'danger';
        if (this.admins.includes(userId)) return 'warning';
        if (this.moderators.includes(userId)) return 'primary';
        if (this.support.includes(userId)) return 'info';
        return 'secondary';
    }
};`;
    
    fs.writeFileSync(path.join(configPath, 'staff.js'), staffConfigContent);
    console.log('✅ Created default staff.js config file');
}

// Try to load ticket routes
try {
    ticketRoutes = require('./routes/tickets');
} catch (error) {
    console.log('⚠️ Ticket routes not found, creating stub...');
    ticketRoutes = express.Router();
    ticketRoutes.get('/support', (req, res) => {
        res.render('support', {
            user: req.user,
            userTickets: [],
            allTickets: [],
            isStaff: false,
            canManage: false,
            role: 'User',
            roleColor: 'secondary',
            stats: { total: 0, open: 0, in_progress: 0, closed: 0 }
        });
    });
}

// Try to load guild section routes
try {
    guildSectionRoutes = require('./routes/guild-sections');
} catch (error) {
    console.log('⚠️ Guild section routes not found, creating stub...');
    guildSectionRoutes = express.Router();
}

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

// Make staff config available globally in views
app.use((req, res, next) => {
    res.locals.staff = staff;
    next();
});

// Passport Configuration
app.use(passport.initialize());
app.use(passport.session());

passport.use(new DiscordStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: `${process.env.DASHBOARD_URL || 'http://localhost:3000'}/auth/discord/callback`,
    scope: ['identify', 'guilds', 'email']
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

// Use routes - ORDER MATTERS!
if (ticketRoutes && typeof ticketRoutes === 'function') {
    app.use('/', ticketRoutes);
} else {
    console.log('⚠️ Ticket routes not loaded');
    // Create a minimal support route
    app.get('/support', requireAuth, (req, res) => {
        res.render('support', {
            user: req.user,
            userTickets: [],
            allTickets: [],
            isStaff: false,
            canManage: false,
            role: 'User',
            roleColor: 'secondary',
            stats: { total: 0, open: 0, in_progress: 0, closed: 0 }
        });
    });
}

if (guildSectionRoutes && typeof guildSectionRoutes === 'function') {
    app.use('/', guildSectionRoutes);
} else {
    console.log('⚠️ Guild section routes not loaded');
}

// Main Routes
app.get('/', (req, res) => {
    res.render('index', { 
        user: req.user,
        botInviteURL: `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=8&scope=bot%20applications.commands`,
        message: res.locals.message,
        messageType: res.locals.messageType
    });
});

app.get('/commands', (req, res) => {
    res.render('commands', {
        user: req.user,
        message: res.locals.message,
        messageType: res.locals.messageType
    });
});

app.get('/profile', requireAuth, (req, res) => {
    res.render('profile', {
        user: req.user,
        message: res.locals.message,
        messageType: res.locals.messageType
    });
});

app.get('/settings', requireAuth, async (req, res) => {
    try {
        let userTickets = 0;
        let userGuilds = req.user.guilds ? req.user.guilds.length : 0;
        
        // Try to get ticket count if database exists
        try {
            const ticketDB = require('../database/tickets');
            const tickets = await ticketDB.getUserTickets(req.user.id);
            userTickets = tickets.length;
        } catch (e) {
            // Ignore if tickets DB doesn't exist
        }
        
        res.render('settings', {
            user: req.user,
            userTickets: userTickets,
            userGuilds: userGuilds,
            message: res.locals.message,
            messageType: res.locals.messageType
        });
    } catch (error) {
        console.error('Settings page error:', error);
        res.status(500).render('error', {
            error: 'Error loading settings',
            user: req.user
        });
    }
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

// Main guild dashboard route
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

        // Check if we have guild-dashboard.ejs or guild-dashboard-section.ejs
        const viewsPath = path.join(__dirname, 'views');
        const hasMainDashboard = fs.existsSync(path.join(viewsPath, 'guild-dashboard.ejs'));
        const hasSectionDashboard = fs.existsSync(path.join(viewsPath, 'guild-dashboard-section.ejs'));
        
        const viewName = hasMainDashboard ? 'guild-dashboard' : (hasSectionDashboard ? 'guild-dashboard-section' : 'error');
        
        if (viewName === 'error') {
            return res.status(500).render('error', {
                error: 'Guild dashboard view not found',
                user: req.user
            });
        }

        res.render(viewName, { 
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
            section: 'general',
            activeSection: 'general',
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

        // Default stats if database not available
        let stats = {
            modLogs: 0,
            customCommands: 0,
            recentActions: []
        };

        // Try to get real stats if database exists
        try {
            const modLogs = await database.getModLogs(guildId, 10);
            const customCommands = await database.getCustomCommands(guildId);
            
            stats = {
                modLogs: modLogs.length,
                customCommands: customCommands.length,
                recentActions: modLogs
            };
        } catch (e) {
            // Use default stats if database methods don't exist
        }
        
        res.json(stats);
    } catch (error) {
        console.error('Stats fetch error:', error);
        res.status(500).json({ error: 'Error loading statistics' });
    }
});

// Commands API
app.get('/api/guild/:guildId/commands', requireAuth, async (req, res) => {
    const guildId = req.params.guildId;
    
    try {
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
        // TODO: Implement command toggle in database
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
        let commands = [];
        
        // Try to get custom commands if database method exists
        if (database.getCustomCommands) {
            commands = await database.getCustomCommands(guildId);
        }
        
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
        if (database.addCustomCommand) {
            await database.addCustomCommand(guildId, commandName, response, req.user.id);
        }
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
        if (database.removeCustomCommand) {
            await database.removeCustomCommand(guildId, commandName);
        }
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

// Error Handler - 404
app.use((req, res) => {
    res.status(404).render('error', { 
        error: 'Page not found',
        user: req.user || null,
        message: null,
        messageType: 'warning'
    });
});

// Error Handler - 500
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).render('error', { 
        error: 'Internal server error',
        user: req.user || null,
        message: null,
        messageType: 'danger'
    });
});

const PORT = process.env.DASHBOARD_PORT || 3000;
app.listen(PORT, () => {
    console.log(`🌐 Dashboard running on http://localhost:${PORT}`);
    console.log(`🎫 Ticket System: ${staff.owners.length} owners, ${staff.admins.length} admins, ${staff.moderators.length} moderators, ${staff.support.length} support staff`);
});