// commands/utility/ping.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Zeigt die Bot-Latenz an'),
    
    category: 'utility',
    cooldown: 5,
    
    async execute(interaction) {
        const sent = await interaction.reply({ 
            content: 'Pinging...', 
            fetchReply: true 
        });
        
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🏓 Pong!')
            .addFields(
                { 
                    name: 'Roundtrip Latenz', 
                    value: `${sent.createdTimestamp - interaction.createdTimestamp}ms`, 
                    inline: true 
                },
                { 
                    name: 'Websocket Heartbeat', 
                    value: `${Math.round(interaction.client.ws.ping)}ms`, 
                    inline: true 
                }
            )
            .setTimestamp()
            .setFooter({ 
                text: `Angefordert von ${interaction.user.tag}`, 
                iconURL: interaction.user.displayAvatarURL() 
            });

        await interaction.editReply({ 
            content: '', 
            embeds: [embed] 
        });
    },
};