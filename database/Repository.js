// database/Repository.js - Generic Database Operations
const sqlite3 = require('sqlite3').verbose();

class Repository {
    constructor(dbPath) {
        this.db = new sqlite3.Database(dbPath);
        this.initTables();
    }

    initTables() {
        const tables = {
            guild_config: `
                CREATE TABLE IF NOT EXISTS guild_config (
                    guild_id TEXT PRIMARY KEY,
                    config TEXT DEFAULT '{}',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`,
            mod_actions: `
                CREATE TABLE IF NOT EXISTS mod_actions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    guild_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    moderator_id TEXT NOT NULL,
                    action_type TEXT NOT NULL,
                    data TEXT DEFAULT '{}',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`
        };

        Object.values(tables).forEach(sql => this.db.run(sql));
    }

    // Generic CRUD operations
    async create(table, data) {
        const columns = Object.keys(data).join(', ');
        const placeholders = Object.keys(data).map(() => '?').join(', ');
        const values = Object.values(data);

        return this.run(
            `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`,
            values
        );
    }

    async find(table, conditions = {}, options = {}) {
        let sql = `SELECT * FROM ${table}`;
        const values = [];

        if (Object.keys(conditions).length > 0) {
            const whereClause = Object.keys(conditions)
                .map(key => `${key} = ?`)
                .join(' AND ');
            sql += ` WHERE ${whereClause}`;
            values.push(...Object.values(conditions));
        }

        if (options.orderBy) {
            sql += ` ORDER BY ${options.orderBy}`;
        }

        if (options.limit) {
            sql += ` LIMIT ${options.limit}`;
        }

        return options.single ? this.get(sql, values) : this.all(sql, values);
    }

    async update(table, data, conditions) {
        const setClause = Object.keys(data)
            .map(key => `${key} = ?`)
            .join(', ');
        const whereClause = Object.keys(conditions)
            .map(key => `${key} = ?`)
            .join(' AND ');

        return this.run(
            `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`,
            [...Object.values(data), ...Object.values(conditions)]
        );
    }

    async delete(table, conditions) {
        const whereClause = Object.keys(conditions)
            .map(key => `${key} = ?`)
            .join(' AND ');

        return this.run(
            `DELETE FROM ${table} WHERE ${whereClause}`,
            Object.values(conditions)
        );
    }

    // Promise wrappers
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }
}

// Specific data access methods
class GuildService extends Repository {
    initTables() {
        super.initTables();
        
        // Additional tables needed by the bot
        const additionalTables = {
            user_warns: `
                CREATE TABLE IF NOT EXISTS user_warns (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    guild_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    moderator_id TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`,
            custom_commands: `
                CREATE TABLE IF NOT EXISTS custom_commands (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    guild_id TEXT NOT NULL,
                    command_name TEXT NOT NULL,
                    response TEXT NOT NULL,
                    created_by TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(guild_id, command_name)
                )`
        };

        Object.values(additionalTables).forEach(sql => this.db.run(sql));
    }

    async getConfig(guildId) {
        const result = await this.find('guild_config', { guild_id: guildId }, { single: true });
        
        if (!result) {
            return this.getDefaultConfig(guildId);
        }

        return {
            ...JSON.parse(result.config),
            guild_id: guildId
        };
    }

    async saveConfig(guildId, config) {
        const data = {
            guild_id: guildId,
            config: JSON.stringify(config),
            updated_at: new Date().toISOString()
        };

        // Upsert operation
        try {
            await this.create('guild_config', data);
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
                await this.update('guild_config', 
                    { config: data.config, updated_at: data.updated_at },
                    { guild_id: guildId }
                );
            } else {
                throw error;
            }
        }
    }

    // Warns System (used by warn.js command)
    async addWarn(guildId, userId, moderatorId, reason) {
        return this.create('user_warns', {
            guild_id: guildId,
            user_id: userId,
            moderator_id: moderatorId,
            reason: reason
        });
    }

    async getUserWarns(guildId, userId) {
        return this.find('user_warns', 
            { guild_id: guildId, user_id: userId },
            { orderBy: 'created_at DESC' }
        );
    }

    async removeWarn(warnId) {
        return this.delete('user_warns', { id: warnId });
    }

    // Custom Commands (used by dashboard)
    async addCustomCommand(guildId, commandName, response, createdBy) {
        return this.create('custom_commands', {
            guild_id: guildId,
            command_name: commandName,
            response: response,
            created_by: createdBy
        });
    }

    async getCustomCommands(guildId) {
        return this.find('custom_commands', { guild_id: guildId });
    }

    async removeCustomCommand(guildId, commandName) {
        return this.delete('custom_commands', {
            guild_id: guildId,
            command_name: commandName
        });
    }

    // Mod Actions (used by moderation commands)
    async addModLog(guildId, userId, moderatorId, action, reason, duration = null) {
        return this.create('mod_actions', {
            guild_id: guildId,
            user_id: userId,
            moderator_id: moderatorId,
            action_type: action,
            data: JSON.stringify({ reason, duration })
        });
    }

    async getModLogs(guildId, limit = 50) {
        return this.find('mod_actions', 
            { guild_id: guildId }, 
            { 
                orderBy: 'created_at DESC',
                limit: limit
            }
        );
    }

    // Legacy method names for compatibility
    async addModAction(guildId, action) {
        return this.addModLog(guildId, action.userId, action.moderatorId, action.type, action.reason, action.duration);
    }

    async getModActions(guildId, options = {}) {
        return this.getModLogs(guildId, options.limit || 50);
    }

    getDefaultConfig(guildId) {
        return {
            guild_id: guildId,
            prefix: '!',
            welcome_channel: null,
            welcome_message: 'Welcome {user} to {server}!',
            mod_log_channel: null,
            auto_role: null,
            music_enabled: true,
            moderation_enabled: true
        };
    }
}

module.exports = { Repository, GuildService };