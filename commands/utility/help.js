const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Display help information and available commands')
        .addStringOption(option =>
            option.setName('command')
                .setDescription('Get detailed information about a specific command')
                .setRequired(false)
        ),
    
    category: 'utility',
    cooldown: 3,
    
    async execute(interaction) {
        const commandName = interaction.options.getString('command');
        const commands = interaction.client.commands || new Map();

        if (commandName) {
            // Show details for a specific command
            const command = commands.get(commandName.toLowerCase());
            
            if (!command) {
                return interaction.reply({ 
                    content: `❌ Command \`${commandName}\` not found!\n\nUse \`/help\` to see all available commands.`, 
                    ephemeral: true 
                });
            }

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle(`📋 Command: /${command.data.name}`)
                .setDescription(command.data.description)
                .addFields(
                    { name: '📂 Category', value: command.category || 'None', inline: true },
                    { name: '⏱️ Cooldown', value: `${command.cooldown || 3} seconds`, inline: true }
                )
                .setTimestamp()
                .setFooter({
                    text: `Requested by ${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL()
                });

            // Add options if they exist
            const options = command.data.options;
            if (options && Array.isArray(options) && options.length > 0) {
                const optionsList = options.map(option => {
                    const required = option.required ? ' `(required)`' : ' `(optional)`';
                    return `**${option.name}**${required}\n${option.description}`;
                }).join('\n\n');
                
                embed.addFields({ 
                    name: '⚙️ Options', 
                    value: optionsList.length > 1024 ? optionsList.substring(0, 1020) + '...' : optionsList,
                    inline: false 
                });
            }

            // Add permissions info if it's a moderation command
            if (command.category === 'moderation' && command.data.default_member_permissions) {
                embed.addFields({
                    name: '🛡️ Required Permissions',
                    value: 'You need appropriate moderation permissions to use this command.',
                    inline: false
                });
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
            .setTitle('📚 Omnia Bot - Command Help')
            .setDescription('Here are all available commands. Use `/help <command>` for detailed information about a specific command.')
            .setTimestamp()
            .setFooter({ 
                text: `${commands.size} commands available • Use /help <command> for details`, 
                iconURL: interaction.client.user.displayAvatarURL() 
            });

        // Add categories as fields
        Object.keys(categories).sort().forEach(category => {
            const categoryCommands = categories[category]
                .sort((a, b) => a.data.name.localeCompare(b.data.name))
                .map(cmd => `\`/${cmd.data.name}\``)
                .join(', ');
            
            const emoji = this.getCategoryEmoji(category);
            
            embed.addFields({
                name: `${emoji} ${category.charAt(0).toUpperCase() + category.slice(1)} (${categories[category].length})`,
                value: categoryCommands || 'No commands',
                inline: false
            });
        });

        // Create select menu for categories (if there are multiple categories)
        const components = [];
        if (Object.keys(categories).length > 1) {
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('help_category')
                .setPlaceholder('🔍 Choose a category for detailed view')
                .addOptions(
                    Object.keys(categories).sort().map(category => ({
                        label: category.charAt(0).toUpperCase() + category.slice(1),
                        value: category,
                        description: `View all ${category} commands (${categories[category].length} commands)`,
                        emoji: this.getCategoryEmoji(category)
                    }))
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);
            components.push(row);
        }

        await interaction.reply({ 
            embeds: [embed], 
            components: components,
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
            'economy': '💰',
            'games': '🎮',
            'social': '👥',
            'other': '📁'
        };
        return emojis[category.toLowerCase()] || '📁';
    }
};