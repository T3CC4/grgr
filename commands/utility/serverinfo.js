const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Display detailed information about the current server'),
    
    category: 'utility',
    cooldown: 5,
    
    async execute(interaction) {
        const { guild } = interaction;
        
        // Calculate server age
        const createdDays = Math.floor((Date.now() - guild.createdTimestamp) / (1000 * 60 * 60 * 24));
        
        // Get verification level text
        const verificationLevels = {
            0: 'None',
            1: 'Low',
            2: 'Medium', 
            3: 'High',
            4: 'Very High'
        };
        
        // Get boost level benefits
        const boostBenefits = {
            0: 'No benefits',
            1: '128 kbps audio, 50 emoji slots, 100MB upload limit',
            2: '256 kbps audio, 100 emoji slots, 50MB upload limit', 
            3: '384 kbps audio, 250 emoji slots, 100MB upload limit'
        };
        
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`📊 ${guild.name}`)
            .setThumbnail(guild.iconURL({ dynamic: true, size: 512 }))
            .addFields(
                { name: '🆔 Server ID', value: guild.id, inline: true },
                { name: '👑 Owner', value: `<@${guild.ownerId}>`, inline: true },
                { name: '📅 Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>\n(${createdDays} days ago)`, inline: true },
                { name: '👥 Members', value: `${guild.memberCount} total`, inline: true },
                { name: '💬 Channels', value: `${guild.channels.cache.size} total`, inline: true },
                { name: '📝 Roles', value: `${guild.roles.cache.size} total`, inline: true },
                { name: '😀 Emojis', value: `${guild.emojis.cache.size}/${guild.premiumTier * 50 + 50}`, inline: true },
                { name: '🚀 Boost Level', value: `Level ${guild.premiumTier}\n${guild.premiumSubscriptionCount || 0} boosts`, inline: true },
                { name: '🔒 Verification', value: verificationLevels[guild.verificationLevel], inline: true }
            )
            .setTimestamp()
            .setFooter({ 
                text: `Requested by ${interaction.user.tag}`, 
                iconURL: interaction.user.displayAvatarURL() 
            });

        if (guild.description) {
            embed.setDescription(`*${guild.description}*`);
        }
        
        if (guild.premiumTier > 0) {
            embed.addFields({
                name: '✨ Boost Benefits',
                value: boostBenefits[guild.premiumTier],
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed] });
    },
};