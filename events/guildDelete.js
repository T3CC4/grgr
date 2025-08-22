// events/guildDelete.js (separate file)
const { Events } = require('discord.js');

module.exports = {
    name: Events.GuildDelete,
    async execute(guild, bot) {
        console.log(`❌ Bot wurde von Server entfernt: ${guild.name} (${guild.id})`);
        
        // Status aktualisieren
        bot.client.user.setPresence({
            activities: [{
                name: `/help | ${bot.client.guilds.cache.size} Server`,
                type: 0
            }],
            status: 'online'
        });

        // Optional: Daten aus Datenbank entfernen
        // await removeGuildFromDatabase(guild);
    },
};