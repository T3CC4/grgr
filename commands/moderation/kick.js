// commands/moderation/kick.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kickt einen User vom Server')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Der User der gekickt werden soll')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Grund für den Kick')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    
    category: 'moderation',
    cooldown: 3,
    
    async execute(interaction) {
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'Kein Grund angegeben';
        const member = interaction.guild.members.cache.get(target.id);

        if (!member) {
            return interaction.reply({ 
                content: '❌ User ist nicht auf diesem Server!', 
                ephemeral: true 
            });
        }

        if (member.id === interaction.user.id) {
            return interaction.reply({ 
                content: '❌ Du kannst dich nicht selbst kicken!', 
                ephemeral: true 
            });
        }

        if (member.roles.highest.position >= interaction.member.roles.highest.position) {
            return interaction.reply({ 
                content: '❌ Du kannst diesen User nicht kicken (höhere/gleiche Rolle)!', 
                ephemeral: true 
            });
        }

        if (!member.kickable) {
            return interaction.reply({ 
                content: '❌ Ich kann diesen User nicht kicken!', 
                ephemeral: true 
            });
        }

        try {
            // DM an den User senden
            const dmEmbed = new EmbedBuilder()
                .setColor('#ff9500')
                .setTitle('⚠️ Du wurdest gekickt!')
                .addFields(
                    { name: 'Server', value: interaction.guild.name, inline: true },
                    { name: 'Moderator', value: interaction.user.tag, inline: true },
                    { name: 'Grund', value: reason, inline: false }
                )
                .setTimestamp();

            await member.send({ embeds: [dmEmbed] }).catch(() => {});

            // User kicken
            await member.kick(reason);

            // Bestätigung
            const confirmEmbed = new EmbedBuilder()
                .setColor('#ff9500')
                .setTitle('👢 User gekickt')
                .addFields(
                    { name: 'User', value: `${target.tag} (${target.id})`, inline: true },
                    { name: 'Moderator', value: interaction.user.tag, inline: true },
                    { name: 'Grund', value: reason, inline: false }
                )
                .setThumbnail(target.displayAvatarURL())
                .setTimestamp();

            await interaction.reply({ embeds: [confirmEmbed] });

        } catch (error) {
            console.error('Kick error:', error);
            await interaction.reply({ 
                content: '❌ Fehler beim Kicken des Users!', 
                ephemeral: true 
            });
        }
    },
};