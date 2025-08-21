const { Events, EmbedBuilder } = require('discord.js');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member, bot) {
        try {
            const config = await bot.database.getGuildConfig(member.guild.id);
            
            // Auto-Role
            if (config.auto_role) {
                const role = member.guild.roles.cache.get(config.auto_role);
                if (role && !member.user.bot) {
                    await member.roles.add(role).catch(err => {
                        console.error(`Konnte Auto-Role nicht vergeben: ${err}`);
                    });
                }
            }
            
            // Welcome Message
            if (config.welcome_channel && config.welcome_message) {
                const channel = member.guild.channels.cache.get(config.welcome_channel);
                if (channel) {
                    const message = config.welcome_message
                        .replace('{user}', member.user.toString())
                        .replace('{server}', member.guild.name)
                        .replace('{memberCount}', member.guild.memberCount.toString());
                    
                    const welcomeEmbed = new EmbedBuilder()
                        .setColor('#00ff00')
                        .setTitle('👋 Willkommen!')
                        .setDescription(message)
                        .setThumbnail(member.user.displayAvatarURL())
                        .setTimestamp()
                        .setFooter({ 
                            text: `Mitglied #${member.guild.memberCount}`,
                            iconURL: member.guild.iconURL()
                        });
                        
                    await channel.send({ embeds: [welcomeEmbed] }).catch(err => {
                        console.error(`Konnte Welcome Message nicht senden: ${err}`);
                    });
                }
            }
        } catch (error) {
            console.error('Error in guildMemberAdd:', error);
        }
    }
};