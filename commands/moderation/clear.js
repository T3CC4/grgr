// commands/moderation/clear.js - IMPROVED
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Delete multiple messages from the current channel')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to delete (1-100)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)
        )
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Only delete messages from this user')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false),
    
    category: 'moderation',
    cooldown: 5,
    
    async execute(interaction) {
        // Permission checks
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({ 
                content: '❌ You need the **Manage Messages** permission to use this command!', 
                ephemeral: true 
            });
        }

        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({ 
                content: '❌ I need the **Manage Messages** permission to execute this command!', 
                ephemeral: true 
            });
        }

        const amount = interaction.options.getInteger('amount');
        const targetUser = interaction.options.getUser('user');

        try {
            // Fetch messages
            const messages = await interaction.channel.messages.fetch({ 
                limit: targetUser ? 100 : amount 
            });

            let messagesToDelete = messages;

            // Filter by user if specified
            if (targetUser) {
                messagesToDelete = messages.filter(msg => msg.author.id === targetUser.id);
                
                if (messagesToDelete.size === 0) {
                    return interaction.reply({ 
                        content: `❌ No recent messages found from ${targetUser.tag}!`, 
                        ephemeral: true 
                    });
                }

                // Limit to requested amount
                messagesToDelete = messagesToDelete.first(amount);
            }

            // Check message age (Discord API limitation: can't delete messages older than 14 days)
            const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
            const validMessages = messagesToDelete.filter(msg => msg.createdTimestamp > twoWeeksAgo);

            if (validMessages.size === 0) {
                return interaction.reply({ 
                    content: '❌ No messages found that can be deleted! (Messages must be less than 14 days old)', 
                    ephemeral: true 
                });
            }

            if (validMessages.size !== messagesToDelete.size) {
                const skipped = messagesToDelete.size - validMessages.size;
                await interaction.reply({ 
                    content: `⚠️ Skipping ${skipped} messages older than 14 days...`, 
                    ephemeral: true 
                });
            }

            // Delete messages
            let deletedCount = 0;
            
            if (validMessages.size === 1) {
                // Single message deletion
                await validMessages.first().delete();
                deletedCount = 1;
            } else {
                // Bulk deletion
                const deleted = await interaction.channel.bulkDelete(validMessages, true);
                deletedCount = deleted.size;
            }

            // Log to mod log (if available)
            try {
                const modLogService = interaction.client.services?.modLog;
                if (modLogService) {
                    await modLogService.logAction(
                        interaction.guild,
                        'CLEAR',
                        targetUser || { tag: 'All Users', id: 'all' },
                        interaction.user,
                        `Deleted ${deletedCount} messages in ${interaction.channel.name}`
                    );
                }
            } catch (logError) {
                console.error('Mod log error:', logError);
            }

            // Success response
            const responseMessage = targetUser 
                ? `✅ Deleted ${deletedCount} messages from ${targetUser.tag}!`
                : `✅ Deleted ${deletedCount} messages!`;

            const reply = await interaction.reply({ 
                content: responseMessage,
                ephemeral: true 
            });

            // Auto-delete the response after 5 seconds
            setTimeout(async () => {
                try {
                    await reply.delete();
                } catch (error) {
                    // Ignore deletion errors
                }
            }, 5000);

        } catch (error) {
            console.error('Clear command error:', error);
            
            let errorMessage = '❌ Failed to delete messages!';
            if (error.code === 10008) {
                errorMessage = '❌ Some messages could not be found!';
            } else if (error.code === 50013) {
                errorMessage = '❌ Missing permissions to delete messages!';
            } else if (error.code === 50034) {
                errorMessage = '❌ You can only delete messages that are under 14 days old!';
            }
            
            await interaction.reply({ 
                content: errorMessage, 
                ephemeral: true 
            });
        }
    },
};