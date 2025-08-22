// managers/EventManager.js - Clean Event Loading
const fs = require('fs');
const path = require('path');

class EventManager {
    constructor(client, services) {
        this.client = client;
        this.services = services;
        this.events = new Map();
    }

    async loadAll() {
        const eventsPath = path.join(process.cwd(), 'events');
        
        if (!fs.existsSync(eventsPath)) {
            console.warn('Events directory not found');
            return;
        }

        const eventFiles = fs.readdirSync(eventsPath)
            .filter(file => file.endsWith('.js'));

        for (const file of eventFiles) {
            await this.loadEvent(path.join(eventsPath, file));
        }

        console.log(`✅ Loaded ${this.events.size} events`);
    }

    async loadEvent(filePath) {
        try {
            delete require.cache[require.resolve(filePath)];
            const event = require(filePath);

            if (!event.name || typeof event.execute !== 'function') {
                console.warn(`Invalid event file: ${filePath}`);
                return;
            }

            // Create event handler with services injection
            const handler = (...args) => event.execute(...args, this.services);

            if (event.once) {
                this.client.once(event.name, handler);
            } else {
                this.client.on(event.name, handler);
            }

            this.events.set(event.name, event);
            console.log(`✅ Loaded event: ${event.name}`);
        } catch (error) {
            console.error(`❌ Failed to load event ${filePath}:`, error.message);
        }
    }
}

module.exports = EventManager;