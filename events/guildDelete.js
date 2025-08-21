// events/guildDelete.js (separate file)
const { Events } = require('discord.js');

module.exports = {
    name: Events.GuildDelete,
    async execute(guild, client) {
        console.log(`❌ Bot wurde von Server entfernt: ${guild.name} (${guild.id})`);
        
        // Status aktualisieren
        client.user.setPresence({
            activities: [{
                name: `/help | ${client.guilds.cache.size} Server`,
                type: 0
            }],
            status: 'online'
        });

        // Optional: Daten aus Datenbank entfernen
        // await removeGuildFromDatabase(guild);
    },
};