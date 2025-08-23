const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const BaseCommand = require('../BaseCommand');

class KickCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
                .setName('kick')
                .setDescription('Kick a user from the server')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to kick')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for the kick')
                        .setRequired(false)
                ),
            {
                category: 'moderation',
                cooldown: 3,
                permissions: ['KickMembers'],
                requiresHierarchy: true
            }
        );
    }

    async execute(interaction, services) {
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const member = interaction.guild.members.cache.get(target.id);

        // Check if user is in server
        if (!member) {
            return interaction.reply({ 
                content: '❌ User is not in this server!', 
                ephemeral: true 
            });
        }

        // Send DM notification
        const dmEmbed = new EmbedBuilder()
            .setColor('#ff9500')
            .setTitle('⚠️ You have been kicked!')
            .addFields(
                { name: 'Server', value: interaction.guild.name, inline: true },
                { name: 'Moderator', value: interaction.user.tag, inline: true },
                { name: 'Reason', value: reason, inline: false }
            )
            .setTimestamp();

        await target.send({ embeds: [dmEmbed] }).catch(() => {});

        // Execute kick
        await member.kick(`${reason} | Kicked by: ${interaction.user.tag}`);

        // Log to database
        if (services.modLog) {
            await services.modLog.logAction(interaction.guild, 'KICK', target, interaction.user, reason);
        }

        // Success response
        const confirmEmbed = new EmbedBuilder()
            .setColor('#ff9500')
            .setTitle('👢 User Kicked')
            .addFields(
                { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
                { name: 'Moderator', value: interaction.user.tag, inline: true },
                { name: 'Reason', value: reason, inline: false }
            )
            .setThumbnail(target.displayAvatarURL())
            .setTimestamp();

        await interaction.reply({ embeds: [confirmEmbed] });
    }
}

module.exports = KickCommand;