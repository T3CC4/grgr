const { SlashCommandBuilder } = require('discord.js');
const BaseCommand = require('../BaseCommand');

class ClearCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
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
                ),
            {
                category: 'moderation',
                cooldown: 5,
                permissions: ['ManageMessages']
            }
        );
    }

    async execute(interaction, services) {
        const amount = interaction.options.getInteger('amount');
        const targetUser = interaction.options.getUser('user');

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

        // Delete messages
        let deletedCount = 0;
        
        if (validMessages.size === 1) {
            await validMessages.first().delete();
            deletedCount = 1;
        } else {
            const deleted = await interaction.channel.bulkDelete(validMessages, true);
            deletedCount = deleted.size;
        }

        // Log to database
        if (services.modLog) {
            await services.modLog.logAction(
                interaction.guild,
                'CLEAR',
                targetUser || { tag: 'All Users', id: 'all' },
                interaction.user,
                `Deleted ${deletedCount} messages in ${interaction.channel.name}`
            );
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
    }
}

module.exports = ClearCommand;