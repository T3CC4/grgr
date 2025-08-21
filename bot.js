// bot.js
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

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
        
        this.init();
    }

    async init() {
        await this.loadCommands();
        await this.loadEvents();
        await this.registerSlashCommands();
        
        this.client.login(process.env.DISCORD_TOKEN);
    }

    // Dynamisches Laden der Commands
    async loadCommands() {
        const commandsPath = path.join(__dirname, 'commands');
        const commandFolders = fs.readdirSync(commandsPath);

        for (const folder of commandFolders) {
            const folderPath = path.join(commandsPath, folder);
            const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

            for (const file of commandFiles) {
                const filePath = path.join(folderPath, file);
                delete require.cache[require.resolve(filePath)];
                
                try {
                    const command = require(filePath);
                    if ('data' in command && 'execute' in command) {
                        this.commands.set(command.data.name, command);
                        console.log(`✅ Command ${command.data.name} loaded`);
                    } else {
                        console.log(`⚠️ Command at ${filePath} is missing required "data" or "execute" property`);
                    }
                } catch (error) {
                    console.error(`❌ Error loading command ${file}:`, error);
                }
            }
        }
    }

    // Event Handler laden
    async loadEvents() {
        const eventsPath = path.join(__dirname, 'events');
        const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

        for (const file of eventFiles) {
            const filePath = path.join(eventsPath, file);
            delete require.cache[require.resolve(filePath)];
            
            try {
                const event = require(filePath);
                if (event.once) {
                    this.client.once(event.name, (...args) => event.execute(...args, this.client));
                } else {
                    this.client.on(event.name, (...args) => event.execute(...args, this.client));
                }
                console.log(`✅ Event ${event.name} loaded`);
            } catch (error) {
                console.error(`❌ Error loading event ${file}:`, error);
            }
        }
    }

    // Slash Commands registrieren
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

    // Command neu laden (für hot reload)
    async reloadCommand(commandName) {
        const command = this.commands.get(commandName);
        if (!command) return false;

        const commandsPath = path.join(__dirname, 'commands');
        const commandFolders = fs.readdirSync(commandsPath);

        for (const folder of commandFolders) {
            const folderPath = path.join(commandsPath, folder);
            const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

            for (const file of commandFiles) {
                const filePath = path.join(folderPath, file);
                delete require.cache[require.resolve(filePath)];
                
                try {
                    const newCommand = require(filePath);
                    if (newCommand.data.name === commandName) {
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

// Bot starten
const bot = new DiscordBot();

module.exports = bot;