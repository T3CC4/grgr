const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Löscht Nachrichten')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Anzahl der zu löschenden Nachrichten')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    
    category: 'moderation',
    
    async execute(interaction) {
        const amount = interaction.options.getInteger('amount');
        
        await interaction.channel.bulkDelete(amount, true);
        
        const reply = await interaction.reply({ 
            content: `✅ ${amount} Nachrichten gelöscht!`,
            ephemeral: true 
        });
        
        setTimeout(() => reply.delete().catch(() => {}), 5000);
    }
};