// commands/moderation/warn.js - IMPROVED
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
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
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false),
    
    category: 'moderation',
    cooldown: 3,
    
    async execute(interaction) {
        // Permission checks
        if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return interaction.reply({ 
                content: '❌ You need the **Moderate Members** permission to use this command!', 
                ephemeral: true 
            });
        }

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

        // Self-warn check
        if (target.id === interaction.user.id) {
            return interaction.reply({ 
                content: '❌ You cannot warn yourself!', 
                ephemeral: true 
            });
        }

        // Bot warn check
        if (target.id === interaction.client.user.id) {
            return interaction.reply({ 
                content: '❌ You cannot warn me!', 
                ephemeral: true 
            });
        }

        // Owner check
        if (target.id === interaction.guild.ownerId) {
            return interaction.reply({ 
                content: '❌ You cannot warn the server owner!', 
                ephemeral: true 
            });
        }

        // Role hierarchy check
        if (member.roles.highest.position >= interaction.member.roles.highest.position) {
            return interaction.reply({ 
                content: '❌ You cannot warn this user! They have a higher or equal role.', 
                ephemeral: true 
            });
        }

        try {
            // Add warning to database
            const database = interaction.client.services?.database;
            if (database) {
                await database.addWarn(
                    interaction.guild.id,
                    target.id,
                    interaction.user.id,
                    reason
                );
            }

            // Get total warnings
            let totalWarnings = 1;
            if (database) {
                const warnings = await database.getUserWarns(interaction.guild.id, target.id);
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

            await target.send({ embeds: [dmEmbed] }).catch(() => {
                // Ignore if DM fails
            });

            // Log to mod log (if available)
            try {
                const modLogService = interaction.client.services?.modLog;
                if (modLogService) {
                    await modLogService.logAction(
                        interaction.guild,
                        'WARN',
                        target,
                        interaction.user,
                        reason
                    );
                }
            } catch (logError) {
                console.error('Mod log error:', logError);
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

        } catch (error) {
            console.error('Warn command error:', error);
            await interaction.reply({ 
                content: '❌ Failed to warn user! Please try again.', 
                ephemeral: true 
            });
        }
    },
};