// events/guildCreate.js
const { Events, EmbedBuilder } = require('discord.js');

module.exports = {
    name: Events.GuildCreate,
    async execute(guild, bot) {
        console.log(`✅ Bot wurde zu Server hinzugefügt: ${guild.name} (${guild.id})`);
        
        // Status aktualisieren
        bot.client.user.setPresence({
            activities: [{
                name: `/help | ${bot.client.guilds.cache.size} Server`,
                type: 0
            }],
            status: 'online'
        });

        // Welcome Message
        const welcomeEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('👋 Vielen Dank für das Hinzufügen!')
            .setDescription('Hallo! Ich bin Omnia, dein neuer Discord Bot. Hier sind ein paar Infos zum Einstieg:')
            .addFields(
                { name: '📋 Commands anzeigen', value: 'Verwende `/help` um alle verfügbaren Commands zu sehen', inline: false },
                { name: '🔧 Setup', value: 'Verwende `/setup` um den Bot zu konfigurieren (falls verfügbar)', inline: false },
                { name: '🌐 Dashboard', value: `Besuche das [Web Dashboard](${process.env.DASHBOARD_URL}) für erweiterte Einstellungen`, inline: false },
                { name: '🆘 Support', value: 'Bei Problemen verwende `/help` oder kontaktiere den Bot-Owner', inline: false }
            )
            .setThumbnail(bot.client.user.displayAvatarURL())
            .setTimestamp()
            .setFooter({ 
                text: `Bot von ${guild.members.cache.get(guild.ownerId)?.user.tag || 'Unbekannt'}` 
            });

        // Ersten Textkanal suchen, wo der Bot Nachrichten senden darf
        const channel = guild.channels.cache
            .filter(ch => 
                ch.type === 0 && 
                ch.permissionsFor(guild.members.me).has(['SendMessages', 'ViewChannel'])
            )
            .first();

        if (channel) {
            try {
                await channel.send({ embeds: [welcomeEmbed] });
            } catch (error) {
                console.error('❌ Konnte Welcome Message nicht senden:', error);
            }
        }
    },
};