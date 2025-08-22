// commands/moderation/ban.js - IMPROVED
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a user from the server')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to ban')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for the ban')
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option.setName('delete_messages')
                .setDescription('Delete messages from the last X days (0-7)')
                .setMinValue(0)
                .setMaxValue(7)
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .setDMPermission(false),
    
    category: 'moderation',
    cooldown: 5,
    
    async execute(interaction) {
        // Permission checks
        if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
            return interaction.reply({ 
                content: '❌ You need the **Ban Members** permission to use this command!', 
                ephemeral: true 
            });
        }

        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) {
            return interaction.reply({ 
                content: '❌ I need the **Ban Members** permission to execute this command!', 
                ephemeral: true 
            });
        }

        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const deleteMessageDays = interaction.options.getInteger('delete_messages') || 0;
        const member = interaction.guild.members.cache.get(target.id);

        // Self-ban check
        if (target.id === interaction.user.id) {
            return interaction.reply({ 
                content: '❌ You cannot ban yourself!', 
                ephemeral: true 
            });
        }

        // Bot ban check
        if (target.id === interaction.client.user.id) {
            return interaction.reply({ 
                content: '❌ I cannot ban myself!', 
                ephemeral: true 
            });
        }

        // Check if user is in server
        if (member) {
            // Role hierarchy check
            if (member.roles.highest.position >= interaction.member.roles.highest.position) {
                return interaction.reply({ 
                    content: '❌ You cannot ban this user! They have a higher or equal role.', 
                    ephemeral: true 
                });
            }

            // Bot role hierarchy check
            if (member.roles.highest.position >= interaction.guild.members.me.roles.highest.position) {
                return interaction.reply({ 
                    content: '❌ I cannot ban this user! They have a higher or equal role than me.', 
                    ephemeral: true 
                });
            }

            // Owner check
            if (member.id === interaction.guild.ownerId) {
                return interaction.reply({ 
                    content: '❌ I cannot ban the server owner!', 
                    ephemeral: true 
                });
            }
        }

        try {
            // Send DM notification (if user is in server)
            if (member) {
                const dmEmbed = new EmbedBuilder()
                    .setColor('#dc3545')
                    .setTitle('🔨 You have been banned!')
                    .addFields(
                        { name: 'Server', value: interaction.guild.name, inline: true },
                        { name: 'Moderator', value: interaction.user.tag, inline: true },
                        { name: 'Reason', value: reason, inline: false }
                    )
                    .setTimestamp();

                await target.send({ embeds: [dmEmbed] }).catch(() => {
                    // Ignore if DM fails
                });
            }

            // Execute ban
            await interaction.guild.members.ban(target, { 
                reason: `${reason} | Banned by: ${interaction.user.tag}`,
                deleteMessageDays: deleteMessageDays
            });

            // Log to mod log (if available)
            try {
                const modLogService = interaction.client.services?.modLog;
                if (modLogService) {
                    await modLogService.logAction(
                        interaction.guild,
                        'BAN',
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

        } catch (error) {
            console.error('Ban command error:', error);
            
            let errorMessage = '❌ Failed to ban user!';
            if (error.code === 10007) {
                errorMessage = '❌ User not found!';
            } else if (error.code === 50013) {
                errorMessage = '❌ Missing permissions to ban this user!';
            }
            
            await interaction.reply({ 
                content: errorMessage, 
                ephemeral: true 
            });
        }
    },
};