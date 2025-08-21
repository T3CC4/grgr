// commands/utility/userinfo.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Zeigt Informationen über einen User an')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Der User dessen Info angezeigt werden soll')
                .setRequired(false)
        ),
    
    category: 'utility',
    cooldown: 3,
    
    async execute(interaction) {
        const user = interaction.options.getUser('user') || interaction.user;
        const member = interaction.guild.members.cache.get(user.id);
        
        const embed = new EmbedBuilder()
            .setColor(member?.displayHexColor || '#0099ff')
            .setTitle(`👤 ${user.tag}`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 512 }))
            .addFields(
                { name: '🆔 User ID', value: user.id, inline: true },
                { name: '📅 Account erstellt', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`, inline: false }
            )
            .setTimestamp()
            .setFooter({ 
                text: `Angefordert von ${interaction.user.tag}`, 
                iconURL: interaction.user.displayAvatarURL() 
            });

        if (member) {
            embed.addFields(
                { name: '📋 Nickname', value: member.nickname || 'Keiner', inline: true },
                { name: '🚪 Beigetreten', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`, inline: false }
            );

            const roles = member.roles.cache
                .filter(role => role.name !== '@everyone')
                .map(role => role.toString())
                .slice(0, 10);
            
            if (roles.length > 0) {
                embed.addFields({ 
                    name: `📝 Rollen [${member.roles.cache.size - 1}]`, 
                    value: roles.join(' ') + (member.roles.cache.size > 11 ? '...' : ''), 
                    inline: false 
                });
            }
        }

        await interaction.reply({ embeds: [embed] });
    },
};