const express = require('express');
const app = express();

class BotAPI {
    constructor(bot) {
        this.bot = bot;
        this.setupRoutes();
    }

    setupRoutes() {
        app.get('/api/bot/guilds', (req, res) => {
            const guilds = this.bot.client.guilds.cache.map(g => ({
                id: g.id,
                name: g.name,
                icon: g.icon,
                memberCount: g.memberCount
            }));
            res.json(guilds);
        });

        app.get('/api/bot/guild/:id/channels', (req, res) => {
            const guild = this.bot.client.guilds.cache.get(req.params.id);
            if (!guild) return res.status(404).json({ error: 'Guild not found' });
            
            const channels = guild.channels.cache
                .filter(c => c.type === 0)
                .map(c => ({ id: c.id, name: c.name }));
            res.json(channels);
        });

        app.listen(3001, () => {
            console.log('Bot API running on port 3001');
        });
    }
}