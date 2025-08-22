const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check the bot\'s latency and response time'),
    
    category: 'utility',
    cooldown: 5,
    
    async execute(interaction) {
        const sent = await interaction.reply({ 
            content: '🏓 Pinging...', 
            fetchReply: true 
        });
        
        const roundtripLatency = sent.createdTimestamp - interaction.createdTimestamp;
        const websocketHeartbeat = Math.round(interaction.client.ws.ping);
        
        // Determine status based on latency
        let status = '🟢 Excellent';
        let color = '#00ff00';
        
        if (roundtripLatency > 200 || websocketHeartbeat > 200) {
            status = '🟡 Good';
            color = '#ffff00';
        }
        if (roundtripLatency > 500 || websocketHeartbeat > 500) {
            status = '🟠 Poor';
            color = '#ff8000';
        }
        if (roundtripLatency > 1000 || websocketHeartbeat > 1000) {
            status = '🔴 Bad';
            color = '#ff0000';
        }
        
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle('🏓 Pong!')
            .addFields(
                { 
                    name: '⏱️ Roundtrip Latency', 
                    value: `${roundtripLatency}ms`, 
                    inline: true 
                },
                { 
                    name: '💓 WebSocket Heartbeat', 
                    value: `${websocketHeartbeat}ms`, 
                    inline: true 
                },
                {
                    name: '📊 Status',
                    value: status,
                    inline: true
                }
            )
            .setTimestamp()
            .setFooter({ 
                text: `Requested by ${interaction.user.tag}`, 
                iconURL: interaction.user.displayAvatarURL() 
            });

        await interaction.editReply({ 
            content: '', 
            embeds: [embed] 
        });
    },
};