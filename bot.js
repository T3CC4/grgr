// bot.js - Simplified Main Bot File
const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

// Services
const { GuildService } = require('./database/Repository');
const CommandManager = require('./managers/CommandManager');
const { createBotAPI } = require('./services/BotAPI');
const EventManager = require('./managers/EventManager');

class OmniaBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers
            ]
        });

        this.services = {};
        this.init();
    }

    async init() {
        await this.setupServices();
        await this.setupManagers();
        await this.setupAPI();
        
        await this.client.login(process.env.DISCORD_TOKEN);
    }

    async setupServices() {
        // Database
        this.services.database = new GuildService(
            process.env.DATABASE_PATH || './database/bot.db'
        );

        // Ticket System  
        const TicketService = require('./services/TicketService');
        this.services.tickets = new TicketService(
            process.env.DATABASE_PATH || './database/bot.db'
        );

        // Moderation Logging
        const ModLogService = require('./services/ModLogService');
        this.services.modLog = new ModLogService(this.services.database);

        // Staff Config
        try {
            this.services.staff = require('./config/staff');
        } catch (error) {
            console.warn('Staff config not found, using defaults');
            this.services.staff = {
                isStaff: () => false,
                canManageTickets: () => false,
                getRole: () => 'User',
                getRoleColor: () => 'secondary'
            };
        }

        console.log('✅ Services initialized');
    }

    async setupManagers() {
        // Command Manager
        this.commandManager = new CommandManager(this.client);
        await this.commandManager.loadAll();

        // Event Manager
        this.eventManager = new EventManager(this.client, this.services);
        await this.eventManager.loadAll();

        console.log('✅ Managers initialized');
    }

    async setupAPI() {
        // Bot API for dashboard communication  
        const express = require('express');
        const api = express();
        api.use(express.json());
        
        // CORS
        api.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Content-Type');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
            next();
        });

        // Debug middleware
        api.use((req, res, next) => {
            console.log(`[API] ${req.method} ${req.url}`);
            next();
        });

        // Commands endpoint
        api.get('/api/bot/commands', (req, res) => {
            try {
                console.log('[API] Loading commands...');
                console.log('[API] Commands available:', this.commandManager.commands.size);
                
                const commands = Array.from(this.commandManager.commands.values()).map(cmd => ({
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
                
                console.log('[API] Returning commands:', commands.length);
                res.json(commands);
            } catch (error) {
                console.error('[API] Commands error:', error);
                res.status(500).json({ error: 'Failed to load commands', details: error.message });
            }
        });

        // Guilds endpoint
        api.get('/api/bot/guilds', (req, res) => {
            try {
                const guilds = this.client.guilds.cache.map(g => ({
                    id: g.id,
                    name: g.name,
                    icon: g.icon,
                    memberCount: g.memberCount
                }));
                console.log('[API] Returning guilds:', guilds.length);
                res.json(guilds);
            } catch (error) {
                console.error('[API] Guilds error:', error);
                res.status(500).json({ error: 'Failed to load guilds' });
            }
        });

        // Guild channels endpoint
        api.get('/api/bot/guild/:id/channels', (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.id);
                if (!guild) return res.status(404).json({ error: 'Guild not found' });
                
                const channels = guild.channels.cache
                    .filter(c => c.type === 0)
                    .sort((a, b) => a.position - b.position)
                    .map(c => ({
                        id: c.id,
                        name: c.name,
                        type: c.type,
                        parent: c.parent?.name || null,
                        position: c.position
                    }));
                res.json(channels);
            } catch (error) {
                console.error('[API] Channels error:', error);
                res.status(500).json({ error: 'Failed to load channels' });
            }
        });

        // Guild roles endpoint
        api.get('/api/bot/guild/:id/roles', (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.id);
                if (!guild) return res.status(404).json({ error: 'Guild not found' });
                
                const roles = guild.roles.cache
                    .filter(r => r.name !== '@everyone' && !r.managed)
                    .sort((a, b) => b.position - a.position)
                    .map(r => ({
                        id: r.id,
                        name: r.name,
                        color: r.hexColor,
                        position: r.position,
                        mentionable: r.mentionable
                    }));
                res.json(roles);
            } catch (error) {
                console.error('[API] Roles error:', error);
                res.status(500).json({ error: 'Failed to load roles' });
            }
        });

        // Stats endpoint
        api.get('/api/bot/stats', (req, res) => {
            try {
                const stats = {
                    guilds: this.client.guilds.cache.size,
                    users: this.client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0),
                    channels: this.client.channels.cache.size,
                    commands: this.commandManager.commands.size,
                    uptime: process.uptime(),
                    memoryUsage: process.memoryUsage(),
                    ping: Math.round(this.client.ws.ping),
                    status: 'online'
                };
                console.log('[API] Returning stats:', stats);
                res.json(stats);
            } catch (error) {
                console.error('[API] Stats error:', error);
                res.status(500).json({ error: 'Failed to load stats' });
            }
        });

        // Root endpoint for testing
        api.get('/', (req, res) => {
            res.json({ 
                message: 'Bot API is running',
                endpoints: [
                    '/api/bot/commands',
                    '/api/bot/guilds', 
                    '/health'
                ]
            });
        });
        
        const port = process.env.BOT_API_PORT || 3001;
        
        api.listen(port, () => {
            console.log(`🔌 Bot API running on port ${port}`);
            console.log(`📋 Available endpoints:`);
            console.log(`   - http://localhost:${port}/api/bot/commands`);
            console.log(`   - http://localhost:${port}/api/bot/guilds`);
            console.log(`   - http://localhost:${port}/health`);
        });

        // Store API reference for debugging
        this.api = api;
    }

    // Getter for external access
    get database() {
        return this.services.database;
    }

    get commands() {
        return this.commandManager.commands;
    }
}

// Start the bot
const bot = new OmniaBot();

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('🛑 Shutting down bot...');
    bot.client.destroy();
    process.exit(0);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

module.exports = bot;