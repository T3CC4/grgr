// events/ready.js
const { Events } = require('discord.js');

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        console.log(`✅ Bot ist online als ${client.user.tag}!`);
        console.log(`🌐 In ${client.guilds.cache.size} Servern aktiv`);
        
        // Status setzen
        client.user.setPresence({
            activities: [{
                name: `/help | ${client.guilds.cache.size} Server`,
                type: 0 // PLAYING
            }],
            status: 'online'
        });

        // Status alle 10 Minuten aktualisieren
        setInterval(() => {
            client.user.setPresence({
                activities: [{
                    name: `/help | ${client.guilds.cache.size} Server`,
                    type: 0
                }],
                status: 'online'
            });
        }, 600000); // 10 Minuten
    },
};