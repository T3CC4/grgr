const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const BaseCommand = require('../BaseCommand');

class WarnCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
                .setName('warn')
                .setDescription('Warn a user for breaking server rules')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to warn')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for the warning')
                        .setRequired(true)
                ),
            {
                category: 'moderation',
                cooldown: 3,
                permissions: ['ModerateMembers'],
                requiresHierarchy: true
            }
        );
    }

    async execute(interaction, services) {
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        const member = interaction.guild.members.cache.get(target.id);

        // Check if user is in server
        if (!member) {
            return interaction.reply({ 
                content: '❌ User is not in this server!', 
                ephemeral: true 
            });
        }

        // Add warning to database
        let totalWarnings = 1;
        if (services.database) {
            await services.database.addWarn(
                interaction.guild.id,
                target.id,
                interaction.user.id,
                reason
            );

            const warnings = await services.database.getUserWarns(interaction.guild.id, target.id);
            totalWarnings = warnings.length;
        }

        // Send DM notification
        const dmEmbed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('⚠️ You have received a warning!')
            .addFields(
                { name: 'Server', value: interaction.guild.name, inline: true },
                { name: 'Moderator', value: interaction.user.tag, inline: true },
                { name: 'Reason', value: reason, inline: false },
                { name: 'Total Warnings', value: totalWarnings.toString(), inline: true }
            )
            .setTimestamp();

        await target.send({ embeds: [dmEmbed] }).catch(() => {});

        // Log to database
        if (services.modLog) {
            await services.modLog.logAction(interaction.guild, 'WARN', target, interaction.user, reason);
        }

        // Success response
        const confirmEmbed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('⚠️ User Warned')
            .addFields(
                { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
                { name: 'Moderator', value: interaction.user.tag, inline: true },
                { name: 'Total Warnings', value: totalWarnings.toString(), inline: true },
                { name: 'Reason', value: reason, inline: false }
            )
            .setThumbnail(target.displayAvatarURL())
            .setTimestamp();

        // Check if auto-action should be taken
        let autoActionMessage = '';
        if (totalWarnings >= 5) {
            autoActionMessage = '\n⚠️ **Notice:** This user now has 5+ warnings. Consider taking further action.';
        } else if (totalWarnings >= 3) {
            autoActionMessage = '\n⚠️ **Notice:** This user now has 3+ warnings.';
        }

        await interaction.reply({ 
            embeds: [confirmEmbed],
            content: autoActionMessage || undefined
        });
    }
}

module.exports = WarnCommand;