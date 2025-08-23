const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const BaseCommand = require('../BaseCommand');

class BanCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
                .setName('ban')
                .setDescription('Ban a user from the server')
                .addUserOption(option =>
                    option.setName('user').setDescription('The user to ban').setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('reason').setDescription('Reason for the ban').setRequired(false)
                )
                .addIntegerOption(option =>
                    option.setName('delete_messages').setDescription('Delete messages from the last X days (0-7)')
                        .setMinValue(0).setMaxValue(7).setRequired(false)
                ),
            {
                category: 'moderation',
                cooldown: 5,
                permissions: ['BanMembers'],
                requiresHierarchy: true
            }
        );
    }

    async execute(interaction, services) {
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const deleteMessageDays = interaction.options.getInteger('delete_messages') || 0;

        // Send DM notification if possible
        const dmEmbed = new EmbedBuilder()
            .setColor('#dc3545')
            .setTitle('🔨 You have been banned!')
            .addFields(
                { name: 'Server', value: interaction.guild.name, inline: true },
                { name: 'Moderator', value: interaction.user.tag, inline: true },
                { name: 'Reason', value: reason, inline: false }
            )
            .setTimestamp();

        await target.send({ embeds: [dmEmbed] }).catch(() => {/* Ignore DM failures */});

        // Execute ban
        await interaction.guild.members.ban(target, { 
            reason: `${reason} | Banned by: ${interaction.user.tag}`,
            deleteMessageDays
        });

        // Log to database
        if (services.modLog) {
            await services.modLog.logAction(interaction.guild, 'BAN', target, interaction.user, reason);
        }

        // Success response
        const confirmEmbed = new EmbedBuilder()
            .setColor('#dc3545')
            .setTitle('🔨 User Banned')
            .addFields(
                { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
                { name: 'Moderator', value: interaction.user.tag, inline: true },
                { name: 'Reason', value: reason, inline: false }
            )
            .setThumbnail(target.displayAvatarURL())
            .setTimestamp()
            .setFooter({ text: `Messages deleted: ${deleteMessageDays} days` });

        await interaction.reply({ embeds: [confirmEmbed] });
    }
}

module.exports = BanCommand;