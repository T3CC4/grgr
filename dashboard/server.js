// dashboard/server.js - SIMPLIFIED VERSION
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
require('dotenv').config();

// Services
const { GuildService } = require('../database/Repository');
const TicketService = require('../services/TicketService');
const setupGuildRoutes = require('./routes/guild');

const app = express();

// Initialize services
let database, ticketService, staff;

try {
    database = new GuildService(process.env.DATABASE_PATH || './database/bot.db');
    ticketService = new TicketService(process.env.DATABASE_PATH || './database/bot.db');
    staff = require('../config/staff');
} catch (error) {
    console.error('Service initialization error:', error.message);
    
    // Create fallback implementations
    database = {
        getGuildConfig: async (guildId) => ({ guild_id: guildId, prefix: '!' }),
        saveGuildConfig: async () => true
    };
    ticketService = {
        getUserTickets: async () => [],
        getAllTickets: async () => [],
        getStats: async () => ({ total: 0, open: 0, in_progress: 0, closed: 0 })
    };
    staff = {
        isStaff: () => false,
        canManageTickets: () => false,
        getRole: () => 'User',
        getRoleColor: () => 'secondary'
    };
    console.log('⚠️ Using fallback services');
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 7 days
}));

// Flash messages
app.use((req, res, next) => {
    res.locals.message = req.session.message || null;
    res.locals.messageType = req.session.messageType || 'info';
    delete req.session.message;
    delete req.session.messageType;
    next();
});

// Passport
app.use(passport.initialize());
app.use(passport.session());

passport.use(new DiscordStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: `${process.env.DASHBOARD_URL || 'http://localhost:3000'}/auth/discord/callback`,
    scope: ['identify', 'guilds']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        profile.accessToken = accessToken;
        return done(null, profile);
    } catch (error) {
        console.error('Discord OAuth Error:', error);
        return done(error, null);
    }
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// Auth middleware
const requireAuth = (req, res, next) => {
    // Development mock user (remove in production!)
    if (process.env.NODE_ENV === 'development' && process.env.MOCK_USER === 'true') {
        req.user = {
            id: '123456789',
            username: 'TestUser',
            avatar: '1234567890abcdef',
            guilds: [
                { id: '987654321', name: 'Test Server', permissions: 0x20, owner: true }
            ]
        };
        return next();
    }
    
    if (req.isAuthenticated()) return next();
    res.redirect('/auth/discord');
};

const BOT_API_URL = `http://localhost:${process.env.BOT_API_PORT || 3001}`;
const axios = require('axios');

const getBotGuilds = async () => {
    try {
        const response = await axios.get(`${BOT_API_URL}/api/bot/guilds`);
        return response.data;
    } catch (error) {
        console.error('Error fetching bot guilds:', error.message);
        return [];
    }
};

// Add API proxy routes BEFORE main routes
app.get('/api/bot/*', async (req, res) => {
    try {
        const apiPath = req.path;
        console.log(`[PROXY] ${apiPath} -> ${BOT_API_URL}${apiPath}`);
        
        const response = await axios.get(`${BOT_API_URL}${apiPath}`);
        res.json(response.data);
    } catch (error) {
        console.error(`[PROXY] Error for ${req.path}:`, error.message);
        
        if (error.code === 'ECONNREFUSED') {
            res.status(503).json({ 
                error: 'Bot API not available', 
                message: 'Make sure the bot is running on port ' + (process.env.BOT_API_PORT || 3001)
            });
        } else {
            res.status(error.response?.status || 500).json({ 
                error: error.response?.data?.error || 'API Error',
                message: error.message 
            });
        }
    }
});

// Routes
app.use('/', setupGuildRoutes(database, { getGuilds: getBotGuilds }, ticketService, staff));

// Main routes
app.get('/', (req, res) => {
    res.render('index', { 
        user: req.user,
        botInviteURL: `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=8&scope=bot%20applications.commands`,
        message: res.locals.message,
        messageType: res.locals.messageType
    });
});

app.get('/features', (req, res) => {
    res.render('features', {
        user: req.user || null,
        message: res.locals.message,
        messageType: res.locals.messageType
    });
});

app.get('/about', (req, res) => {
    res.render('about', {
        user: req.user || null,
        message: res.locals.message,
        messageType: res.locals.messageType
    });
});

app.get('/commands-list', (req, res) => {
    res.render('commands-list', {
        user: req.user || null,
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
        
        try {
            const tickets = await ticketService.getUserTickets(req.user.id);
            userTickets = tickets.length;
        } catch (e) {
            // Ignore if tickets don't work
        }
        
        res.render('settings', {
            user: req.user,
            userTickets,
            userGuilds,
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
        const userGuilds = req.user.guilds.filter(guild => 
            (guild.permissions & 0x20) === 0x20 || guild.owner
        );
        const botGuilds = await getBotGuilds();
        
        const guildsWithBotStatus = userGuilds.map(guild => ({
            ...guild,
            botInGuild: botGuilds.some(botGuild => botGuild.id === guild.id)
        }));

        const totalMembers = botGuilds.reduce((acc, guild) => acc + (guild.memberCount || 0), 0);

        res.render('dashboard', { 
            user: req.user, 
            guilds: guildsWithBotStatus,
            botGuilds: botGuilds.length,
            totalMembers,
            botInviteURL: `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=8&scope=bot%20applications.commands&guild_id=`,
            message: res.locals.message,
            messageType: res.locals.messageType
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).render('error', { 
            error: 'Error loading dashboard',
            user: req.user
        });
    }
});

// Auth routes
app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback', 
    passport.authenticate('discord', { 
        failureRedirect: '/',
        failureMessage: true 
    }), 
    (req, res) => {
        req.session.message = 'Successfully logged in!';
        req.session.messageType = 'success';
        res.redirect('/dashboard');
    }
);

// Auth error handler
app.get('/auth/error', (req, res) => {
    res.render('error', {
        error: 'Authentication failed. This might be due to rate limiting. Please try again in a few minutes.',
        user: null
    });
});

// Catch auth errors
app.use('/auth/*', (err, req, res, next) => {
    if (err.code === 'invalid_request' || err.message.includes('rate limit')) {
        req.session.message = 'Too many login attempts. Please wait a few minutes and try again.';
        req.session.messageType = 'warning';
        return res.redirect('/?error=rate_limit');
    }
    next(err);
});

app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) console.error('Logout error:', err);
        req.session.message = 'Successfully logged out!';
        req.session.messageType = 'info';
        res.redirect('/');
    });
});

// Error handlers
app.use((req, res) => {
    res.status(404).render('error', { 
        error: 'Page not found',
        user: req.user || null
    });
});

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).render('error', { 
        error: 'Internal server error',
        user: req.user || null
    });
});

const PORT = process.env.DASHBOARD_PORT || 3000;
app.listen(PORT, () => {
    console.log(`🌐 Dashboard running on http://localhost:${PORT}`);
});