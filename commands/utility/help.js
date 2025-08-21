// commands/utility/help.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Zeigt alle verfügbaren Commands an')
        .addStringOption(option =>
            option.setName('command')
                .setDescription('Spezifischer Command für Details')
                .setRequired(false)
        ),
    
    category: 'utility',
    cooldown: 3,
    
    async execute(interaction) {
        const commandName = interaction.options.getString('command');
        const { commands } = interaction.client;

        if (commandName) {
            // Zeige Details für einen spezifischen Command
            const command = commands.get(commandName);
            
            if (!command) {
                return interaction.reply({ 
                    content: `❌ Command \`${commandName}\` nicht gefunden!`, 
                    ephemeral: true 
                });
            }

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`📋 Command: /${command.data.name}`)
                .setDescription(command.data.description)
                .addFields(
                    { name: 'Kategorie', value: command.category || 'Keine', inline: true },
                    { name: 'Cooldown', value: `${command.cooldown || 0} Sekunden`, inline: true }
                )
                .setTimestamp();

            if (command.data.options && command.data.options.length > 0) {
                const options = command.data.options.map(option => 
                    `\`${option.name}\` - ${option.description} ${option.required ? '(erforderlich)' : '(optional)'}`
                ).join('\n');
                
                embed.addFields({ name: 'Optionen', value: options });
            }

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Zeige alle Commands kategorisiert
        const categories = {};
        
        commands.forEach(command => {
            const category = command.category || 'Andere';
            if (!categories[category]) categories[category] = [];
            categories[category].push(command);
        });

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('📚 Hilfe - Verfügbare Commands')
            .setDescription('Verwende `/help <command>` für Details zu einem spezifischen Command.')
            .setTimestamp()
            .setFooter({ 
                text: `${commands.size} Commands verfügbar`, 
                iconURL: interaction.client.user.displayAvatarURL() 
            });

        // Füge Kategorien als Fields hinzu
        Object.keys(categories).forEach(category => {
            const categoryCommands = categories[category]
                .map(cmd => `\`/${cmd.data.name}\``)
                .join(', ');
            
            embed.addFields({
                name: `${this.getCategoryEmoji(category)} ${category}`,
                value: categoryCommands,
                inline: false
            });
        });

        // Select Menu für Kategorien
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_category')
            .setPlaceholder('Wähle eine Kategorie für Details')
            .addOptions(
                Object.keys(categories).map(category => ({
                    label: category,
                    value: category,
                    description: `${categories[category].length} Commands`,
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
            'andere': '📁'
        };
        return emojis[category.toLowerCase()] || '📁';
    }
};