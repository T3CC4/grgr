// commands/moderation/ban.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bannt einen User vom Server')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Der User der gebannt werden soll')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Grund für den Ban')
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option.setName('delete_messages')
                .setDescription('Nachrichten der letzten X Tage löschen (0-7)')
                .setMinValue(0)
                .setMaxValue(7)
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    
    category: 'moderation',
    cooldown: 3,
    
    async execute(interaction) {
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'Kein Grund angegeben';
        const deleteMessageDays = interaction.options.getInteger('delete_messages') || 0;
        const member = interaction.guild.members.cache.get(target.id);

        if (member) {
            if (member.id === interaction.user.id) {
                return interaction.reply({ 
                    content: '❌ Du kannst dich nicht selbst bannen!', 
                    ephemeral: true 
                });
            }

            if (member.roles.highest.position >= interaction.member.roles.highest.position) {
                return interaction.reply({ 
                    content: '❌ Du kannst diesen User nicht bannen (höhere/gleiche Rolle)!', 
                    ephemeral: true 
                });
            }

            if (!member.bannable) {
                return interaction.reply({ 
                    content: '❌ Ich kann diesen User nicht bannen!', 
                    ephemeral: true 
                });
            }
        }

        try {
            // DM an den User senden (falls auf Server)
            if (member) {
                const dmEmbed = new EmbedBuilder()
                    .setColor('#dc3545')
                    .setTitle('🔨 Du wurdest gebannt!')
                    .addFields(
                        { name: 'Server', value: interaction.guild.name, inline: true },
                        { name: 'Moderator', value: interaction.user.tag, inline: true },
                        { name: 'Grund', value: reason, inline: false }
                    )
                    .setTimestamp();

                await member.send({ embeds: [dmEmbed] }).catch(() => {});
            }

            // User bannen
            await interaction.guild.members.ban(target, { 
                reason: reason,
                deleteMessageDays: deleteMessageDays
            });

            // Bestätigung
            const confirmEmbed = new EmbedBuilder()
                .setColor('#dc3545')
                .setTitle('🔨 User gebannt')
                .addFields(
                    { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
                    { name: 'Moderator', value: interaction.user.tag, inline: true },
                    { name: 'Grund', value: reason, inline: false }
                )
                .setThumbnail(target.displayAvatarURL())
                .setTimestamp();
            await interaction.reply({ embeds: [confirmEmbed] });

        } catch (error) {
            console.error('Ban error:', error);
            await interaction.reply({ 
                content: '❌ Fehler beim Bannen des Users!', 
                ephemeral: true 
            });
        }
    },
};