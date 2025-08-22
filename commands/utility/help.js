// commands/utility/help.js - FIXED
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Shows all available commands')
        .addStringOption(option =>
            option.setName('command')
                .setDescription('Specific command for details')
                .setRequired(false)
        ),
    
    category: 'utility',
    cooldown: 3,
    
    async execute(interaction) {
        const commandName = interaction.options.getString('command');
        const bot = require('../../bot');
        const commands = bot.commands;

        if (commandName) {
            // Show details for a specific command
            const command = commands.get(commandName);
            
            if (!command) {
                return interaction.reply({ 
                    content: `❌ Command \`${commandName}\` not found!`, 
                    ephemeral: true 
                });
            }

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle(`📋 Command: /${command.data.name}`)
                .setDescription(command.data.description)
                .addFields(
                    { name: 'Category', value: command.category || 'None', inline: true },
                    { name: 'Cooldown', value: `${command.cooldown || 0} seconds`, inline: true }
                )
                .setTimestamp();

            // Check if options exist and is an array
            const options = command.data.options;
            if (options && Array.isArray(options) && options.length > 0) {
                const optionsList = options.map(option => 
                    `\`${option.name}\` - ${option.description} ${option.required ? '(required)' : '(optional)'}`
                ).join('\n');
                
                embed.addFields({ name: 'Options', value: optionsList });
            }

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Show all commands categorized
        const categories = {};
        
        commands.forEach(command => {
            const category = command.category || 'Other';
            if (!categories[category]) categories[category] = [];
            categories[category].push(command);
        });

        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('📚 Omnia Bot - Available Commands')
            .setDescription('Use `/help <command>` for details about a specific command.')
            .setTimestamp()
            .setFooter({ 
                text: `${commands.size} commands available`, 
                iconURL: interaction.client.user.displayAvatarURL() 
            });

        // Add categories as fields
        Object.keys(categories).forEach(category => {
            const categoryCommands = categories[category]
                .map(cmd => `\`/${cmd.data.name}\``)
                .join(', ');
            
            embed.addFields({
                name: `${this.getCategoryEmoji(category)} ${category.charAt(0).toUpperCase() + category.slice(1)}`,
                value: categoryCommands || 'No commands',
                inline: false
            });
        });

        // Create select menu for categories
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_category')
            .setPlaceholder('Choose a category for details')
            .addOptions(
                Object.keys(categories).map(category => ({
                    label: category.charAt(0).toUpperCase() + category.slice(1),
                    value: category,
                    description: `${categories[category].length} commands`,
                    emoji: this.getCategoryEmoji(category)
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({ 
            embeds: [embed], 
            components: [row],
            ephemeral: true 
        });
    },

    getCategoryEmoji(category) {
        const emojis = {
            'utility': '🔧',
            'moderation': '🛡️',
            'fun': '🎉',
            'music': '🎵',
            'admin': '⚙️',
            'other': '📁'
        };
        return emojis[category.toLowerCase()] || '📁';
    }
};