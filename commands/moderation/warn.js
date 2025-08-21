const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const database = require('../../database/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Verwarnt einen User')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Der zu verwarnende User')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Grund der Verwarnung')
                .setRequired(true)
        ),
    
    category: 'moderation',
    
    async execute(interaction) {
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        
        await database.addWarn(
            interaction.guild.id,
            target.id,
            interaction.user.id,
            reason
        );
        
        const warns = await database.getUserWarns(interaction.guild.id, target.id);
        
        const embed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('⚠️ User verwarnt')
            .addFields(
                { name: 'User', value: target.tag, inline: true },
                { name: 'Warnungen gesamt', value: warns.length.toString(), inline: true },
                { name: 'Grund', value: reason }
            );
            
        await interaction.reply({ embeds: [embed] });
    }
};