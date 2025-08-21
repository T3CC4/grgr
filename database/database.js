// database/database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
    constructor() {
        this.dbPath = process.env.DATABASE_PATH || './database/bot.db';
        this.init();
    }

    init() {
        // Erstelle database Ordner falls nicht vorhanden
        const dbDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        this.db = new sqlite3.Database(this.dbPath, (err) => {
            if (err) {
                console.error('❌ Database connection error:', err.message);
            } else {
                console.log('✅ Connected to SQLite database');
                this.createTables();
            }
        });
    }

    createTables() {
        // Guild Konfiguration Tabelle
        this.db.run(`
            CREATE TABLE IF NOT EXISTS guild_config (
                guild_id TEXT PRIMARY KEY,
                prefix TEXT DEFAULT '!',
                welcome_channel TEXT DEFAULT NULL,
                welcome_message TEXT DEFAULT 'Willkommen {user} auf {server}!',
                mod_log_channel TEXT DEFAULT NULL,
                auto_role TEXT DEFAULT NULL,
                music_enabled BOOLEAN DEFAULT 1,
                moderation_enabled BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // User Warns Tabelle
        this.db.run(`
            CREATE TABLE IF NOT EXISTS user_warns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                moderator_id TEXT NOT NULL,
                reason TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Custom Commands Tabelle
        this.db.run(`
            CREATE TABLE IF NOT EXISTS custom_commands (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                command_name TEXT NOT NULL,
                response TEXT NOT NULL,
                created_by TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(guild_id, command_name)
            )
        `);

        // Moderation Logs Tabelle
        this.db.run(`
            CREATE TABLE IF NOT EXISTS mod_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                moderator_id TEXT NOT NULL,
                action TEXT NOT NULL,
                reason TEXT,
                duration INTEGER DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('✅ Database tables created/verified');
    }

    // Guild Konfiguration Methods
    async getGuildConfig(guildId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM guild_config WHERE guild_id = ?',
                [guildId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row || this.getDefaultConfig(guildId));
                }
            );
        });
    }

    async saveGuildConfig(guildId, config) {
        return new Promise((resolve, reject) => {
            const {
                prefix, welcomeChannel, welcomeMessage, modLogChannel,
                autoRole, musicEnabled, moderationEnabled
            } = config;

            this.db.run(`
                INSERT OR REPLACE INTO guild_config 
                (guild_id, prefix, welcome_channel, welcome_message, mod_log_channel, 
                 auto_role, music_enabled, moderation_enabled, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [
                guildId, prefix, welcomeChannel, welcomeMessage, modLogChannel,
                autoRole, musicEnabled ? 1 : 0, moderationEnabled ? 1 : 0
            ], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    getDefaultConfig(guildId) {
        return {
            guild_id: guildId,
            prefix: '!',
            welcome_channel: null,
            welcome_message: 'Willkommen {user} auf {server}!',
            mod_log_channel: null,
            auto_role: null,
            music_enabled: true,
            moderation_enabled: true
        };
    }

    // User Warns Methods
    async addWarn(guildId, userId, moderatorId, reason) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO user_warns (guild_id, user_id, moderator_id, reason) VALUES (?, ?, ?, ?)',
                [guildId, userId, moderatorId, reason],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    async getUserWarns(guildId, userId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM user_warns WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC',
                [guildId, userId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    async removeWarn(warnId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'DELETE FROM user_warns WHERE id = ?',
                [warnId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    // Custom Commands Methods
    async addCustomCommand(guildId, commandName, response, createdBy) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO custom_commands (guild_id, command_name, response, created_by) VALUES (?, ?, ?, ?)',
                [guildId, commandName, response, createdBy],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    async getCustomCommands(guildId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM custom_commands WHERE guild_id = ?',
                [guildId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    async removeCustomCommand(guildId, commandName) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'DELETE FROM custom_commands WHERE guild_id = ? AND command_name = ?',
                [guildId, commandName],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    // Moderation Logs Methods
    async addModLog(guildId, userId, moderatorId, action, reason, duration = null) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO mod_logs (guild_id, user_id, moderator_id, action, reason, duration) VALUES (?, ?, ?, ?, ?, ?)',
                [guildId, userId, moderatorId, action, reason, duration],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    async getModLogs(guildId, limit = 50) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM mod_logs WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?',
                [guildId, limit],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    // Guild Management
    async addGuild(guildId) {
        const defaultConfig = this.getDefaultConfig(guildId);
        return this.saveGuildConfig(guildId, defaultConfig);
    }

    async removeGuild(guildId) {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run('DELETE FROM guild_config WHERE guild_id = ?', [guildId]);
                this.db.run('DELETE FROM user_warns WHERE guild_id = ?', [guildId]);
                this.db.run('DELETE FROM custom_commands WHERE guild_id = ?', [guildId]);
                this.db.run('DELETE FROM mod_logs WHERE guild_id = ?', [guildId], function(err) {
                    if (err) reject(err);
                    else resolve(true);
                });
            });
        });
    }

    // Cleanup and close
    close() {
        this.db.close((err) => {
            if (err) {
                console.error('❌ Database close error:', err.message);
            } else {
                console.log('✅ Database connection closed');
            }
        });
    }
}

module.exports = new Database();