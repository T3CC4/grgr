// commands/moderation/kick.js - IMPROVED
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
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
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .setDMPermission(false),
    
    category: 'moderation',
    cooldown: 3,
    
    async execute(interaction) {
        // Permission checks
        if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
            return interaction.reply({ 
                content: '❌ You need the **Kick Members** permission to use this command!', 
                ephemeral: true 
            });
        }

        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)) {
            return interaction.reply({ 
                content: '❌ I need the **Kick Members** permission to execute this command!', 
                ephemeral: true 
            });
        }

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

        // Self-kick check
        if (member.id === interaction.user.id) {
            return interaction.reply({ 
                content: '❌ You cannot kick yourself!', 
                ephemeral: true 
            });
        }

        // Bot kick check
        if (member.id === interaction.client.user.id) {
            return interaction.reply({ 
                content: '❌ I cannot kick myself!', 
                ephemeral: true 
            });
        }

        // Owner check
        if (member.id === interaction.guild.ownerId) {
            return interaction.reply({ 
                content: '❌ I cannot kick the server owner!', 
                ephemeral: true 
            });
        }

        // Role hierarchy check
        if (member.roles.highest.position >= interaction.member.roles.highest.position) {
            return interaction.reply({ 
                content: '❌ You cannot kick this user! They have a higher or equal role.', 
                ephemeral: true 
            });
        }

        // Bot role hierarchy check
        if (member.roles.highest.position >= interaction.guild.members.me.roles.highest.position) {
            return interaction.reply({ 
                content: '❌ I cannot kick this user! They have a higher or equal role than me.', 
                ephemeral: true 
            });
        }

        try {
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

            await target.send({ embeds: [dmEmbed] }).catch(() => {
                // Ignore if DM fails
            });

            // Execute kick
            await member.kick(`${reason} | Kicked by: ${interaction.user.tag}`);

            // Log to mod log (if available)
            try {
                const modLogService = interaction.client.services?.modLog;
                if (modLogService) {
                    await modLogService.logAction(
                        interaction.guild,
                        'KICK',
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

        } catch (error) {
            console.error('Kick command error:', error);
            
            let errorMessage = '❌ Failed to kick user!';
            if (error.code === 10007) {
                errorMessage = '❌ User not found!';
            } else if (error.code === 50013) {
                errorMessage = '❌ Missing permissions to kick this user!';
            }
            
            await interaction.reply({ 
                content: errorMessage, 
                ephemeral: true 
            });
        }
    },
};