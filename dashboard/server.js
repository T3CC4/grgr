// dashboard/server.js - PRODUCTION VERSION (NO MOCK DATA)
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
    process.exit(1); // Exit instead of using fallbacks in production
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

// Get bot client for team data - IMPLEMENTED TODO
const getBotClient = async () => {
    try {
        // Check if bot is available and get basic info
        const response = await axios.get(`${BOT_API_URL}/api/bot/stats`);
        if (response.data.status === 'online') {
            // Return a proxy object that can make API calls to the bot
            return {
                isAvailable: true,
                fetchUser: async (userId) => {
                    try {
                        const userResponse = await axios.get(`${BOT_API_URL}/api/bot/user/${userId}`);
                        return userResponse.data;
                    } catch (error) {
                        throw new Error(`Could not fetch user ${userId}: ${error.message}`);
                    }
                },
                getGuildMember: async (guildId, userId) => {
                    try {
                        const memberResponse = await axios.get(`${BOT_API_URL}/api/bot/guild/${guildId}/member/${userId}`);
                        return memberResponse.data;
                    } catch (error) {
                        return null; // User not in guild
                    }
                }
            };
        }
        return null;
    } catch (error) {
        console.warn('Bot client not available:', error.message);
        return null;
    }
};

// Team API endpoint using staff.js with real Discord data
app.get('/api/about/team', async (req, res) => {
    try {
        console.log('[TEAM API] Loading team members from staff config...');
        
        const allStaffIds = staff.getAllStaffIds();
        
        if (allStaffIds.length === 0) {
            console.log('[TEAM API] No staff members configured');
            return res.json({
                members: [],
                stats: { total: 0, online: 0, ...staff.getTeamStats() },
                lastUpdated: new Date().toISOString(),
                source: 'empty'
            });
        }

        console.log(`[TEAM API] Found ${allStaffIds.length} staff members: ${allStaffIds.join(', ')}`);

        // Try to use the bulk team endpoint from bot API
        try {
            console.log('[TEAM API] Trying bulk team endpoint...');
            const response = await axios.post(`${BOT_API_URL}/api/bot/team/members`, {
                userIds: allStaffIds
            }, {
                timeout: 10000 // 10 second timeout
            });

            if (response.data && Array.isArray(response.data)) {
                console.log(`[TEAM API] Bulk endpoint returned ${response.data.length} members`);
                
                // Enhance with role data from staff config
                const enhancedMembers = response.data.map(member => ({
                    ...member,
                    role: staff.getRole(member.id),
                    bio: staff.getStaffBio(member.id, staff.getRole(member.id))
                }));

                // Sort by role hierarchy
                const roleOrder = { 'Owner': 0, 'Admin': 1, 'Moderator': 2, 'Support': 3 };
                enhancedMembers.sort((a, b) => {
                    const aOrder = roleOrder[a.role] || 999;
                    const bOrder = roleOrder[b.role] || 999;
                    return aOrder - bOrder;
                });

                const onlineCount = enhancedMembers.filter(member => 
                    member.status === 'online' || member.status === 'idle' || member.status === 'dnd'
                ).length;

                const teamData = {
                    members: enhancedMembers,
                    stats: {
                        total: enhancedMembers.length,
                        online: onlineCount,
                        ...staff.getTeamStats()
                    }
                };

                const response_data = {
                    ...teamData,
                    lastUpdated: new Date().toISOString(),
                    source: 'discord_api_bulk'
                };

                console.log(`[TEAM API] Returning ${teamData.members.length} team members (bulk)`);
                return res.json(response_data);
            }
        } catch (bulkError) {
            console.warn('[TEAM API] Bulk endpoint failed:', bulkError.message);
        }

        // Fallback: Try individual user endpoints
        try {
            console.log('[TEAM API] Trying individual user endpoints...');
            const teamMembers = [];
            let onlineCount = 0;

            for (const userId of allStaffIds) {
                try {
                    console.log(`[TEAM API] Fetching user ${userId}...`);
                    const userResponse = await axios.get(`${BOT_API_URL}/api/bot/user/${userId}`, {
                        timeout: 5000
                    });

                    if (userResponse.data) {
                        const user = userResponse.data;
                        const role = staff.getRole(userId);
                        
                        // Try to get member data from any guild
                        let memberData = null;
                        try {
                            const guildsResponse = await axios.get(`${BOT_API_URL}/api/bot/guilds`, {
                                timeout: 5000
                            });
                            
                            if (guildsResponse.data && Array.isArray(guildsResponse.data)) {
                                for (const guild of guildsResponse.data.slice(0, 3)) { // Check first 3 guilds only
                                    try {
                                        const memberResponse = await axios.get(
                                            `${BOT_API_URL}/api/bot/guild/${guild.id}/member/${userId}`,
                                            { timeout: 3000 }
                                        );
                                        if (memberResponse.data) {
                                            memberData = memberResponse.data;
                                            break;
                                        }
                                    } catch (memberError) {
                                        // User not in this guild, continue
                                    }
                                }
                            }
                        } catch (guildError) {
                            console.warn(`[TEAM API] Could not check guilds for ${userId}:`, guildError.message);
                        }

                        const status = memberData?.presence?.status || 'offline';
                        if (status === 'online' || status === 'idle' || status === 'dnd') {
                            onlineCount++;
                        }

                        teamMembers.push({
                            id: user.id,
                            username: user.username,
                            discriminator: user.discriminator,
                            tag: user.tag,
                            displayName: memberData?.displayName || user.username,
                            avatarURL: user.avatarURL,
                            role: role,
                            status: status,
                            bio: staff.getStaffBio(userId, role)
                        });
                    }
                } catch (userError) {
                    console.warn(`[TEAM API] Could not fetch user ${userId}:`, userError.message);
                    // Skip users that can't be fetched
                }
            }

            if (teamMembers.length > 0) {
                // Sort by role hierarchy
                const roleOrder = { 'Owner': 0, 'Admin': 1, 'Moderator': 2, 'Support': 3 };
                teamMembers.sort((a, b) => {
                    const aOrder = roleOrder[a.role] || 999;
                    const bOrder = roleOrder[b.role] || 999;
                    return aOrder - bOrder;
                });

                const teamData = {
                    members: teamMembers,
                    stats: {
                        total: teamMembers.length,
                        online: onlineCount,
                        ...staff.getTeamStats()
                    }
                };

                const response_data = {
                    ...teamData,
                    lastUpdated: new Date().toISOString(),
                    source: 'discord_api_individual'
                };

                console.log(`[TEAM API] Returning ${teamData.members.length} team members (individual)`);
                return res.json(response_data);
            }
        } catch (individualError) {
            console.warn('[TEAM API] Individual endpoints failed:', individualError.message);
        }

        // Final fallback: Return minimal data with just staff config
        console.log('[TEAM API] Bot API not available, returning minimal data...');
        const basicTeamData = {
            members: allStaffIds.map((userId, index) => ({
                id: userId,
                username: `Staff Member ${index + 1}`,
                discriminator: '0000',
                tag: `Staff Member ${index + 1}#0000`,
                displayName: `${staff.getRole(userId)} Member`,
                avatarURL: `https://cdn.discordapp.com/embed/avatars/${index % 6}.png`,
                role: staff.getRole(userId),
                status: 'offline',
                bio: staff.getStaffBio(userId, staff.getRole(userId))
            })),
            stats: {
                total: allStaffIds.length,
                online: 0,
                ...staff.getTeamStats()
            }
        };

        // Sort by role hierarchy
        const roleOrder = { 'Owner': 0, 'Admin': 1, 'Moderator': 2, 'Support': 3 };
        basicTeamData.members.sort((a, b) => {
            const aOrder = roleOrder[a.role] || 999;
            const bOrder = roleOrder[b.role] || 999;
            return aOrder - bOrder;
        });

        const response_data = {
            ...basicTeamData,
            lastUpdated: new Date().toISOString(),
            source: 'staff_config_only'
        };

        console.log(`[TEAM API] Returning ${basicTeamData.members.length} team members (fallback)`);
        res.json(response_data);

    } catch (error) {
        console.error('[TEAM API] Critical error:', error);
        res.status(500).json({ 
            error: 'Failed to load team members',
            details: error.message,
            members: [],
            stats: { total: 0, online: 0, ...staff.getTeamStats() }
        });
    }
});

// Add bot API routes to support team data fetching
app.get('/api/bot/user/:userId', async (req, res) => {
    try {
        const apiPath = `/api/bot/user/${req.params.userId}`;
        const response = await axios.get(`${BOT_API_URL}${apiPath}`);
        res.json(response.data);
    } catch (error) {
        res.status(404).json({ error: 'User not found' });
    }
});

app.get('/api/bot/guild/:guildId/member/:userId', async (req, res) => {
    try {
        const apiPath = `/api/bot/guild/${req.params.guildId}/member/${req.params.userId}`;
        const response = await axios.get(`${BOT_API_URL}${apiPath}`);
        res.json(response.data);
    } catch (error) {
        res.status(404).json({ error: 'Member not found' });
    }
});

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
        botInviteURL: `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=8&scope=bot%20applications.commands`,
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
            console.warn('Could not load user tickets:', e.message);
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
    console.log(`👥 Team members configured: ${staff.getAllStaffIds().length}`);
    console.log(`📊 Staff breakdown: ${staff.owners.length} owners, ${staff.admins.length} admins, ${staff.moderators.length} moderators, ${staff.support.length} support`);
});