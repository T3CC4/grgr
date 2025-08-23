const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const BaseCommand = require('../BaseCommand');

class UserinfoCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
                .setName('userinfo')
                .setDescription('Display detailed information about a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to get information about')
                        .setRequired(false)
                ),
            {
                category: 'utility',
                cooldown: 3
            }
        );
    }

    async execute(interaction, services) {
        const user = interaction.options.getUser('user') || interaction.user;
        const member = interaction.guild.members.cache.get(user.id);
        
        // Calculate account age
        const accountAge = Math.floor((Date.now() - user.createdTimestamp) / (1000 * 60 * 60 * 24));
        
        // Determine user status
        let statusIcon = '⚪';
        let statusText = 'Offline';
        
        if (member?.presence?.status) {
            const statusMap = {
                'online': { icon: '🟢', text: 'Online' },
                'idle': { icon: '🟡', text: 'Idle' },
                'dnd': { icon: '🔴', text: 'Do Not Disturb' },
                'offline': { icon: '⚪', text: 'Offline' }
            };
            const status = statusMap[member.presence.status];
            statusIcon = status.icon;
            statusText = status.text;
        }
        
        const embed = new EmbedBuilder()
            .setColor(member?.displayHexColor || '#0099ff')
            .setTitle(`👤 ${user.tag}`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 512 }))
            .addFields(
                { name: '🆔 User ID', value: user.id, inline: true },
                { name: `${statusIcon} Status`, value: statusText, inline: true },
                { name: '🤖 Bot', value: user.bot ? 'Yes' : 'No', inline: true },
                { name: '📅 Account Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>\n(${accountAge} days ago)`, inline: false }
            )
            .setTimestamp()
            .setFooter({ 
                text: `Requested by ${interaction.user.tag}`, 
                iconURL: interaction.user.displayAvatarURL() 
            });

        // Add server-specific information if user is in guild
        if (member) {
            const joinAge = Math.floor((Date.now() - member.joinedTimestamp) / (1000 * 60 * 60 * 24));
            
            embed.addFields(
                { name: '📋 Nickname', value: member.nickname || 'None', inline: true },
                { name: '🚪 Joined Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>\n(${joinAge} days ago)`, inline: false }
            );

            // Add roles (limit to prevent embed overflow)
            const roles = member.roles.cache
                .filter(role => role.name !== '@everyone')
                .sort((a, b) => b.position - a.position)
                .map(role => role.toString());
            
            if (roles.length > 0) {
                const rolesList = roles.length > 10 
                    ? roles.slice(0, 10).join(' ') + ` ... and ${roles.length - 10} more`
                    : roles.join(' ');
                    
                embed.addFields({ 
                    name: `📝 Roles [${member.roles.cache.size - 1}]`, 
                    value: rolesList || 'None',
                    inline: false 
                });
            }
        } else {
            embed.addFields({
                name: '❌ Server Member',
                value: 'User is not in this server',
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed] });
    }
}

module.exports = UserinfoCommand;