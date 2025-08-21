// commands/utility/serverinfo.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Zeigt Informationen über den Server an'),
    
    category: 'utility',
    cooldown: 5,
    
    async execute(interaction) {
        const { guild } = interaction;
        
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`📊 ${guild.name}`)
            .setThumbnail(guild.iconURL({ dynamic: true, size: 512 }))
            .addFields(
                { name: '🆔 Server ID', value: guild.id, inline: true },
                { name: '👑 Owner', value: `<@${guild.ownerId}>`, inline: true },
                { name: '📅 Erstellt', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: true },
                { name: '👥 Mitglieder', value: guild.memberCount.toString(), inline: true },
                { name: '💬 Channels', value: guild.channels.cache.size.toString(), inline: true },
                { name: '📝 Rollen', value: guild.roles.cache.size.toString(), inline: true },
                { name: '😀 Emojis', value: guild.emojis.cache.size.toString(), inline: true },
                { name: '🚀 Boost Level', value: guild.premiumTier.toString(), inline: true },
                { name: '💎 Boosts', value: guild.premiumSubscriptionCount?.toString() || '0', inline: true }
            )
            .setTimestamp()
            .setFooter({ 
                text: `Angefordert von ${interaction.user.tag}`, 
                iconURL: interaction.user.displayAvatarURL() 
            });

        if (guild.description) {
            embed.setDescription(guild.description);
        }

        await interaction.reply({ embeds: [embed] });
    },
};