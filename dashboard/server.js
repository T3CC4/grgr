// dashboard/server.js
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const axios = require('axios');
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
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7 // 7 Tage
    }
}));

// Passport Configuration
app.use(passport.initialize());
app.use(passport.session());

passport.use(new DiscordStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: `${process.env.DASHBOARD_URL}/auth/discord/callback`,
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

const getBotGuilds = async () => {
    try {
        // Hier würdest du die Guilds vom Bot selbst holen
        // Für jetzt simulieren wir es
        return [];
    } catch (error) {
        console.error('Error fetching bot guilds:', error);
        return [];
    }
};

// Routes
app.get('/', (req, res) => {
    res.render('index', { 
        user: req.user,
        botInviteURL: `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=8&scope=bot%20applications.commands`
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

        res.render('dashboard', { 
            user: req.user, 
            guilds: guildsWithBotStatus,
            botInviteURL: `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=8&scope=bot%20applications.commands&guild_id=`
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).render('error', { 
            error: 'Fehler beim Laden des Dashboards',
            user: req.user 
        });
    }
});

app.get('/dashboard/:guildId', requireAuth, async (req, res) => {
    const guildId = req.params.guildId;
    
    try {
        const userGuild = req.user.guilds.find(guild => guild.id === guildId);
        
        if (!userGuild || !hasManageGuildPermission(userGuild)) {
            return res.status(403).render('error', { 
                error: 'Du hast keine Berechtigung für diesen Server!',
                user: req.user 
            });
        }

        // Guild Configuration laden (aus Datenbank)
        const guildConfig = {
            guildId: guildId,
            prefix: '!',
            welcomeChannel: null,
            welcomeMessage: 'Willkommen {user} auf {server}!',
            modLogChannel: null,
            autoRole: null,
            musicEnabled: true,
            moderationEnabled: true,
            customCommands: []
        };

        res.render('guild-dashboard', { 
            user: req.user, 
            guild: userGuild,
            config: guildConfig
        });
    } catch (error) {
        console.error('Guild dashboard error:', error);
        res.status(500).render('error', { 
            error: 'Fehler beim Laden der Guild-Einstellungen',
            user: req.user 
        });
    }
});

// API Routes für AJAX Requests
app.post('/api/guild/:guildId/config', requireAuth, async (req, res) => {
    const guildId = req.params.guildId;
    const config = req.body;
    
    try {
        const userGuild = req.user.guilds.find(guild => guild.id === guildId);
        
        if (!userGuild || !hasManageGuildPermission(userGuild)) {
            return res.status(403).json({ error: 'Keine Berechtigung' });
        }

        // Hier würdest du die Konfiguration in der Datenbank speichern
        console.log('Saving config for guild', guildId, config);
        
        res.json({ success: true, message: 'Konfiguration gespeichert!' });
    } catch (error) {
        console.error('Config save error:', error);
        res.status(500).json({ error: 'Fehler beim Speichern' });
    }
});

app.get('/api/guild/:guildId/channels', requireAuth, async (req, res) => {
    const guildId = req.params.guildId;
    
    try {
        const userGuild = req.user.guilds.find(guild => guild.id === guildId);
        
        if (!userGuild || !hasManageGuildPermission(userGuild)) {
            return res.status(403).json({ error: 'Keine Berechtigung' });
        }

        // Hier würdest du die Channels vom Bot API holen
        const channels = [
            { id: '123', name: 'general', type: 0 },
            { id: '124', name: 'welcome', type: 0 },
            { id: '125', name: 'mod-logs', type: 0 }
        ];
        
        res.json(channels);
    } catch (error) {
        console.error('Channels fetch error:', error);
        res.status(500).json({ error: 'Fehler beim Laden der Channels' });
    }
});

app.get('/api/guild/:guildId/roles', requireAuth, async (req, res) => {
    const guildId = req.params.guildId;
    
    try {
        const userGuild = req.user.guilds.find(guild => guild.id === guildId);
        
        if (!userGuild || !hasManageGuildPermission(userGuild)) {
            return res.status(403).json({ error: 'Keine Berechtigung' });
        }

        // Hier würdest du die Rollen vom Bot API holen
        const roles = [
            { id: '456', name: 'Member', color: '#99aab5' },
            { id: '457', name: 'Moderator', color: '#f1c40f' },
            { id: '458', name: 'Admin', color: '#e74c3c' }
        ];
        
        res.json(roles);
    } catch (error) {
        console.error('Roles fetch error:', error);
        res.status(500).json({ error: 'Fehler beim Laden der Rollen' });
    }
});

// Auth Routes
app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback', 
    passport.authenticate('discord', { failureRedirect: '/' }), 
    (req, res) => {
        res.redirect('/dashboard');
    }
);

app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) console.error('Logout error:', err);
        res.redirect('/');
    });
});

// Error Handler
app.use((req, res) => {
    res.status(404).render('error', { 
        error: 'Seite nicht gefunden',
        user: req.user 
    });
});

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).render('error', { 
        error: 'Interner Serverfehler',
        user: req.user 
    });
});

const PORT = process.env.DASHBOARD_PORT || 3000;
app.listen(PORT, () => {
    console.log(`🌐 Dashboard läuft auf http://localhost:${PORT}`);
});