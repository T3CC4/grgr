// bot.js - UPDATED with Commands API
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const database = require('./database/database');

class DiscordBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers
            ]
        });
        
        this.commands = new Collection();
        this.events = new Collection();
        this.cooldowns = new Collection();
        this.database = database;
        
        // Start Bot API for Dashboard
        this.startAPI();
        
        this.init();
    }

    async init() {
        await this.loadCommands();
        await this.loadEvents();
        await this.registerSlashCommands();
        
        this.client.login(process.env.DISCORD_TOKEN);
    }

    // Bot API for Dashboard
    startAPI() {
        const express = require('express');
        const app = express();
        app.use(express.json());
        
        // CORS for Dashboard
        app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
            res.header('Access-Control-Allow-Headers', 'Content-Type');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
            next();
        });

        // Get all bot guilds
        app.get('/api/bot/guilds', (req, res) => {
            const guilds = this.client.guilds.cache.map(g => ({
                id: g.id,
                name: g.name,
                icon: g.icon,
                memberCount: g.memberCount
            }));
            res.json(guilds);
        });

        // Get all available commands with categories
        app.get('/api/bot/commands', (req, res) => {
            const commands = Array.from(this.commands.values()).map(cmd => ({
                name: cmd.data.name,
                description: cmd.data.description,
                category: cmd.category || 'Other',
                cooldown: cmd.cooldown || 3,
                options: cmd.data.options ? cmd.data.options.map(opt => ({
                    name: opt.name,
                    description: opt.description,
                    required: opt.required
                })) : []
            }));
            res.json(commands);
        });

        // Get guild channels
        app.get('/api/bot/guild/:id/channels', (req, res) => {
            const guild = this.client.guilds.cache.get(req.params.id);
            if (!guild) return res.status(404).json({ error: 'Guild not found' });
            
            const channels = guild.channels.cache
                .filter(c => c.type === 0) // Text channels only
                .sort((a, b) => a.position - b.position)
                .map(c => ({ 
                    id: c.id, 
                    name: c.name, 
                    type: c.type,
                    parent: c.parent ? c.parent.name : null
                }));
            res.json(channels);
        });

        // Get guild roles
        app.get('/api/bot/guild/:id/roles', (req, res) => {
            const guild = this.client.guilds.cache.get(req.params.id);
            if (!guild) return res.status(404).json({ error: 'Guild not found' });
            
            const roles = guild.roles.cache
                .filter(r => r.name !== '@everyone' && !r.managed) // Don't show @everyone and bot roles
                .sort((a, b) => b.position - a.position)
                .map(r => ({ 
                    id: r.id, 
                    name: r.name, 
                    color: r.hexColor,
                    position: r.position,
                    mentionable: r.mentionable
                }));
            res.json(roles);
        });

        // Get guild stats
        app.get('/api/bot/guild/:id/stats', (req, res) => {
            const guild = this.client.guilds.cache.get(req.params.id);
            if (!guild) return res.status(404).json({ error: 'Guild not found' });
            
            const stats = {
                memberCount: guild.memberCount,
                channelCount: guild.channels.cache.size,
                roleCount: guild.roles.cache.size,
                emojiCount: guild.emojis.cache.size,
                boostLevel: guild.premiumTier,
                boostCount: guild.premiumSubscriptionCount || 0,
                createdAt: guild.createdAt,
                ownerId: guild.ownerId
            };
            res.json(stats);
        });

        // Reload commands endpoint (for dynamic updates)
        app.post('/api/bot/reload-commands', async (req, res) => {
            try {
                await this.loadCommands();
                await this.registerSlashCommands();
                res.json({ success: true, message: 'Commands reloaded successfully' });
            } catch (error) {
                res.status(500).json({ error: 'Failed to reload commands' });
            }
        });

        const BOT_API_PORT = process.env.BOT_API_PORT || 3001;
        app.listen(BOT_API_PORT, () => {
            console.log(`🔌 Bot API running on port ${BOT_API_PORT}`);
        });
    }

    // Load commands dynamically
    async loadCommands() {
        this.commands.clear(); // Clear existing commands for reload
        const commandsPath = path.join(__dirname, 'commands');
        
        if (!fs.existsSync(commandsPath)) {
            console.error('❌ Commands folder not found!');
            return;
        }
        
        const commandFolders = fs.readdirSync(commandsPath);

        for (const folder of commandFolders) {
            const folderPath = path.join(commandsPath, folder);
            
            // Skip if not a directory
            if (!fs.statSync(folderPath).isDirectory()) continue;
            
            const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

            for (const file of commandFiles) {
                const filePath = path.join(folderPath, file);
                delete require.cache[require.resolve(filePath)];
                
                try {
                    const command = require(filePath);
                    if ('data' in command && 'execute' in command) {
                        // Add category based on folder name
                        command.category = folder;
                        this.commands.set(command.data.name, command);
                        console.log(`✅ Command ${command.data.name} loaded from ${folder}`);
                    } else {
                        console.log(`⚠️ Command at ${filePath} is missing required "data" or "execute" property`);
                    }
                } catch (error) {
                    console.error(`❌ Error loading command ${file}:`, error);
                }
            }
        }
    }

    // Load event handlers
    async loadEvents() {
        const eventsPath = path.join(__dirname, 'events');
        
        if (!fs.existsSync(eventsPath)) {
            console.error('❌ Events folder not found!');
            return;
        }
        
        const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

        for (const file of eventFiles) {
            const filePath = path.join(eventsPath, file);
            delete require.cache[require.resolve(filePath)];
            
            try {
                const event = require(filePath);
                if (event.once) {
                    this.client.once(event.name, (...args) => event.execute(...args, this));
                } else {
                    this.client.on(event.name, (...args) => event.execute(...args, this));
                }
                console.log(`✅ Event ${event.name} loaded`);
            } catch (error) {
                console.error(`❌ Error loading event ${file}:`, error);
            }
        }
    }

    // Register slash commands
    async registerSlashCommands() {
        const commands = [];
        
        for (const command of this.commands.values()) {
            commands.push(command.data.toJSON());
        }

        const rest = new REST().setToken(process.env.DISCORD_TOKEN);

        try {
            console.log(`🔄 Started refreshing ${commands.length} application (/) commands.`);

            await rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID),
                { body: commands }
            );

            console.log(`✅ Successfully reloaded ${commands.length} application (/) commands.`);
        } catch (error) {
            console.error('❌ Error registering slash commands:', error);
        }
    }

    // Reload command (for hot reload)
    async reloadCommand(commandName) {
        const command = this.commands.get(commandName);
        if (!command) return false;

        const commandsPath = path.join(__dirname, 'commands');
        const commandFolders = fs.readdirSync(commandsPath);

        for (const folder of commandFolders) {
            const folderPath = path.join(commandsPath, folder);
            if (!fs.statSync(folderPath).isDirectory()) continue;
            
            const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

            for (const file of commandFiles) {
                const filePath = path.join(folderPath, file);
                delete require.cache[require.resolve(filePath)];
                
                try {
                    const newCommand = require(filePath);
                    if (newCommand.data.name === commandName) {
                        newCommand.category = folder;
                        this.commands.set(newCommand.data.name, newCommand);
                        return true;
                    }
                } catch (error) {
                    console.error(`❌ Error reloading command ${commandName}:`, error);
                    return false;
                }
            }
        }
        return false;
    }
}

// Start bot
const bot = new DiscordBot();

module.exports = bot;