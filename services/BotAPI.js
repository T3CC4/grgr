// services/BotAPI.js - Clean API Service
class BotAPIService {
    constructor(client, commands) {
        this.client = client;
        this.commands = commands; // Commands collection from bot
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    // Cached data retrieval
    getCached(key, fetcher) {
        const cached = this.cache.get(key);
        const now = Date.now();

        if (cached && (now - cached.timestamp) < this.cacheTimeout) {
            return cached.data;
        }

        const data = fetcher();
        this.cache.set(key, { data, timestamp: now });
        return data;
    }

    // Core data methods
    getGuilds() {
        return this.getCached('guilds', () => 
            this.client.guilds.cache.map(g => ({
                id: g.id,
                name: g.name,
                icon: g.icon,
                memberCount: g.memberCount
            }))
        );
    }

    getGuild(guildId) {
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) return null;

        return this.getCached(`guild_${guildId}`, () => ({
            id: guild.id,
            name: guild.name,
            icon: guild.icon,
            memberCount: guild.memberCount,
            ownerId: guild.ownerId,
            channels: this.getChannels(guildId),
            roles: this.getRoles(guildId)
        }));
    }

    getChannels(guildId) {
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) return [];

        return guild.channels.cache
            .filter(c => c.type === 0) // Text channels only
            .sort((a, b) => a.position - b.position)
            .map(c => ({
                id: c.id,
                name: c.name,
                type: c.type,
                parent: c.parent?.name || null,
                position: c.position
            }));
    }

    getRoles(guildId) {
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) return [];

        return guild.roles.cache
            .filter(r => r.name !== '@everyone' && !r.managed)
            .sort((a, b) => b.position - a.position)
            .map(r => ({
                id: r.id,
                name: r.name,
                color: r.hexColor,
                position: r.position,
                mentionable: r.mentionable
            }));
    }

    getCommands() {
        // Get commands from the bot's command collection
        if (!this.commands || this.commands.size === 0) {
            return [];
        }

        return Array.from(this.commands.values()).map(cmd => ({
            name: cmd.data.name,
            description: cmd.data.description,
            category: cmd.category || 'Other',
            cooldown: cmd.cooldown || 3,
            options: cmd.data.options ? cmd.data.options.map(opt => ({
                name: opt.name,
                description: opt.description,
                required: opt.required || false,
                type: opt.type
            })) : []
        }));
    }

    // Stats and monitoring
    getStats() {
        return {
            guilds: this.client.guilds.cache.size,
            users: this.client.users.cache.size,
            channels: this.client.channels.cache.size,
            commands: this.commands ? this.commands.size : 0,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage()
        };
    }
}

// Express API wrapper
function createBotAPI(client, commands) {
    const express = require('express');
    const app = express();
    const service = new BotAPIService(client, commands);

    app.use(express.json());

    // CORS
    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', process.env.DASHBOARD_URL || '*');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
        next();
    });

    // Routes
    const routes = {
        '/guilds': () => service.getGuilds(),
        '/guild/:id': (req) => service.getGuild(req.params.id),
        '/guild/:id/channels': (req) => service.getChannels(req.params.id),
        '/guild/:id/roles': (req) => service.getRoles(req.params.id),
        '/commands': () => service.getCommands(),
        '/stats': () => service.getStats()
    };

    // Auto-register routes
    Object.entries(routes).forEach(([path, handler]) => {
        app.get(`/api/bot${path}`, async (req, res) => {
            try {
                const data = await handler(req);
                if (data === null || data === undefined) {
                    return res.status(404).json({ error: 'Not found' });
                }
                res.json(data);
            } catch (error) {
                console.error(`API Error ${path}:`, error);
                res.status(500).json({ error: error.message });
            }
        });
    });

    // Health check
    app.get('/health', (req, res) => {
        res.json({ 
            status: 'online', 
            timestamp: new Date().toISOString(),
            stats: service.getStats()
        });
    });

    return app;
}

module.exports = { BotAPIService, createBotAPI };