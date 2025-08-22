// managers/CommandManager.js - Simplified Command Loading
const { Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

class CommandManager {
    constructor(client) {
        this.client = client;
        this.commands = new Collection();
        this.cooldowns = new Collection();
        this.rest = new REST().setToken(process.env.DISCORD_TOKEN);
    }

    async loadAll() {
        const commandsPath = path.join(process.cwd(), 'commands');
        
        if (!fs.existsSync(commandsPath)) {
            console.warn('Commands directory not found');
            return;
        }

        await this.loadFromDirectory(commandsPath);
        await this.registerSlashCommands();
        
        console.log(`✅ Loaded ${this.commands.size} commands`);
    }

    async loadFromDirectory(dir, category = null) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                await this.loadFromDirectory(fullPath, entry.name);
            } else if (entry.name.endsWith('.js')) {
                await this.loadCommand(fullPath, category);
            }
        }
    }

    async loadCommand(filePath, category) {
        try {
            // Clear require cache for hot reloading
            delete require.cache[require.resolve(filePath)];
            
            const command = require(filePath);
            
            if (!this.validateCommand(command)) {
                console.warn(`Invalid command: ${filePath}`);
                return;
            }

            command.category = category || 'Misc';
            this.commands.set(command.data.name, command);
            
            console.log(`✅ Loaded command: ${command.data.name} (${category})`);
        } catch (error) {
            console.error(`❌ Failed to load command ${filePath}:`, error.message);
        }
    }

    validateCommand(command) {
        return command && 
               typeof command.execute === 'function' &&
               command.data &&
               typeof command.data.name === 'string';
    }

    async registerSlashCommands() {
        const commandData = Array.from(this.commands.values())
            .map(cmd => cmd.data.toJSON());

        try {
            console.log(`🔄 Registering ${commandData.length} slash commands...`);
            
            await this.rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID),
                { body: commandData }
            );
            
            console.log('✅ Slash commands registered successfully');
        } catch (error) {
            console.error('❌ Failed to register slash commands:', error);
        }
    }

    async executeCommand(interaction) {
        const command = this.commands.get(interaction.commandName);
        
        if (!command) {
            console.warn(`Command not found: ${interaction.commandName}`);
            return;
        }

        // Check cooldown
        if (!this.checkCooldown(interaction, command)) {
            return;
        }

        try {
            await command.execute(interaction);
            this.logCommand(interaction, command);
        } catch (error) {
            console.error(`Command execution error: ${interaction.commandName}`, error);
            await this.handleCommandError(interaction, error);
        }
    }

    checkCooldown(interaction, command) {
        const cooldownAmount = (command.cooldown || 3) * 1000;
        const commandCooldowns = this.cooldowns.get(command.data.name) || new Collection();
        
        const now = Date.now();
        const userCooldown = commandCooldowns.get(interaction.user.id);

        if (userCooldown && (now < userCooldown + cooldownAmount)) {
            const timeLeft = Math.ceil((userCooldown + cooldownAmount - now) / 1000);
            
            interaction.reply({
                content: `⏰ Please wait ${timeLeft} more seconds before using this command.`,
                ephemeral: true
            });
            
            return false;
        }

        commandCooldowns.set(interaction.user.id, now);
        this.cooldowns.set(command.data.name, commandCooldowns);
        
        // Clean up old cooldowns
        setTimeout(() => commandCooldowns.delete(interaction.user.id), cooldownAmount);
        
        return true;
    }

    async handleCommandError(interaction, error) {
        const errorMessage = '❌ There was an error executing this command!';
        
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, ephemeral: true });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        } catch (replyError) {
            console.error('Failed to send error message:', replyError);
        }
    }

    logCommand(interaction, command) {
        const guild = interaction.guild ? interaction.guild.name : 'DM';
        console.log(`[CMD] ${interaction.user.tag} used /${command.data.name} in ${guild}`);
    }

    // Hot reload single command
    async reloadCommand(commandName) {
        const command = this.commands.get(commandName);
        if (!command) return false;

        // Find the file path (simplified - you might need to track this)
        const commandsPath = path.join(process.cwd(), 'commands');
        // Implementation depends on how you want to track file paths
        
        return true;
    }

    // Get command info for dashboard
    getCommandsInfo() {
        return Array.from(this.commands.values()).map(cmd => ({
            name: cmd.data.name,
            description: cmd.data.description,
            category: cmd.category,
            cooldown: cmd.cooldown || 3,
            options: cmd.data.options || []
        }));
    }
}

module.exports = CommandManager;