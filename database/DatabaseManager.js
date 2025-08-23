// database/DatabaseManager.js - Enterprise database management service
const sqlite3 = require('sqlite3').verbose();

class DatabaseManager {
    constructor(dbPath) {
        this.db = new sqlite3.Database(dbPath);
        this.initializeAllTables();
    }

    initializeAllTables() {
        const tableDefinitions = {
            guild_configurations: `CREATE TABLE IF NOT EXISTS guild_configurations (
                guild_id TEXT PRIMARY KEY,
                configuration_data TEXT DEFAULT '{}',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            moderation_warnings: `CREATE TABLE IF NOT EXISTS moderation_warnings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                moderator_id TEXT NOT NULL,
                warning_reason TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            custom_commands: `CREATE TABLE IF NOT EXISTS custom_commands (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                command_name TEXT NOT NULL,
                response_content TEXT NOT NULL,
                created_by TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(guild_id, command_name)
            )`,
            moderation_actions: `CREATE TABLE IF NOT EXISTS moderation_actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                moderator_id TEXT NOT NULL,
                action_type TEXT NOT NULL,
                action_data TEXT DEFAULT '{}',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            support_tickets: `CREATE TABLE IF NOT EXISTS support_tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_id TEXT UNIQUE NOT NULL,
                user_id TEXT NOT NULL,
                username TEXT NOT NULL,
                category TEXT NOT NULL,
                subject TEXT NOT NULL,
                status TEXT DEFAULT 'open',
                priority_level TEXT DEFAULT 'normal',
                assigned_to TEXT DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                closed_at DATETIME DEFAULT NULL,
                closed_by TEXT DEFAULT NULL
            )`,
            ticket_messages: `CREATE TABLE IF NOT EXISTS ticket_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                username TEXT NOT NULL,
                message_content TEXT NOT NULL,
                is_staff_member BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (ticket_id) REFERENCES support_tickets(ticket_id)
            )`
        };

        Object.values(tableDefinitions).forEach(sql => this.db.run(sql));
        console.log('✅ Database tables initialized');
    }

    // Generic CRUD operations
    async createRecord(table, data) {
        const columnNames = Object.keys(data).join(', ');
        const placeholderValues = Object.keys(data).map(() => '?').join(', ');
        const parameterValues = Object.values(data);

        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO ${table} (${columnNames}) VALUES (${placeholderValues})`,
                parameterValues,
                function(err) {
                    if (err) reject(err);
                    else resolve({ recordId: this.lastID, affectedRows: this.changes });
                }
            );
        });
    }

    async findRecords(table, searchCriteria = {}, queryOptions = {}) {
        let sqlQuery = `SELECT * FROM ${table}`;
        const queryParameters = [];

        if (Object.keys(searchCriteria).length > 0) {
            const whereClause = Object.keys(searchCriteria)
                .map(key => `${key} = ?`)
                .join(' AND ');
            sqlQuery += ` WHERE ${whereClause}`;
            queryParameters.push(...Object.values(searchCriteria));
        }

        if (queryOptions.orderBy) sqlQuery += ` ORDER BY ${queryOptions.orderBy}`;
        if (queryOptions.limit) sqlQuery += ` LIMIT ${queryOptions.limit}`;

        return new Promise((resolve, reject) => {
            if (queryOptions.singleRecord) {
                this.db.get(sqlQuery, queryParameters, (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            } else {
                this.db.all(sqlQuery, queryParameters, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            }
        });
    }

    async updateRecord(table, updateData, searchCriteria) {
        const setClause = Object.keys(updateData)
            .map(key => `${key} = ?`)
            .join(', ');
        const whereClause = Object.keys(searchCriteria)
            .map(key => `${key} = ?`)
            .join(' AND ');

        return new Promise((resolve, reject) => {
            this.db.run(
                `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`,
                [...Object.values(updateData), ...Object.values(searchCriteria)],
                function(err) {
                    if (err) reject(err);
                    else resolve({ affectedRows: this.changes });
                }
            );
        });
    }

    async deleteRecord(table, searchCriteria) {
        const whereClause = Object.keys(searchCriteria)
            .map(key => `${key} = ?`)
            .join(' AND ');

        return new Promise((resolve, reject) => {
            this.db.run(
                `DELETE FROM ${table} WHERE ${whereClause}`,
                Object.values(searchCriteria),
                function(err) {
                    if (err) reject(err);
                    else resolve({ affectedRows: this.changes });
                }
            );
        });
    }

    // Guild Configuration Methods
    async getGuildConfiguration(guildId) {
        const configurationRecord = await this.findRecords('guild_configurations', 
            { guild_id: guildId }, 
            { singleRecord: true }
        );
        
        if (!configurationRecord) {
            return this.getDefaultGuildConfiguration(guildId);
        }

        return {
            ...JSON.parse(configurationRecord.configuration_data),
            guild_id: guildId
        };
    }

    async saveGuildConfiguration(guildId, configurationData) {
        const dataToSave = {
            guild_id: guildId,
            configuration_data: JSON.stringify(configurationData),
            updated_at: new Date().toISOString()
        };

        try {
            await this.createRecord('guild_configurations', dataToSave);
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
                await this.updateRecord('guild_configurations', 
                    { 
                        configuration_data: dataToSave.configuration_data, 
                        updated_at: dataToSave.updated_at 
                    },
                    { guild_id: guildId }
                );
            } else {
                throw error;
            }
        }
    }

    getDefaultGuildConfiguration(guildId) {
        return {
            guild_id: guildId,
            command_prefix: '!',
            welcome_channel_id: null,
            welcome_message_template: 'Welcome {user} to {server}!',
            moderation_log_channel: null,
            auto_assign_role: null,
            music_system_enabled: true,
            moderation_system_enabled: true
        };
    }

    // Moderation Warning Methods
    async addModerationWarning(guildId, userId, moderatorId, warningReason) {
        return this.createRecord('moderation_warnings', {
            guild_id: guildId,
            user_id: userId,
            moderator_id: moderatorId,
            warning_reason: warningReason
        });
    }

    async getUserModerationWarnings(guildId, userId) {
        return this.findRecords('moderation_warnings', 
            { guild_id: guildId, user_id: userId },
            { orderBy: 'created_at DESC' }
        );
    }

    async removeModerationWarning(warningId) {
        return this.deleteRecord('moderation_warnings', { id: warningId });
    }

    // Custom Command Methods
    async addCustomCommand(guildId, commandName, responseContent, createdBy) {
        return this.createRecord('custom_commands', {
            guild_id: guildId,
            command_name: commandName,
            response_content: responseContent,
            created_by: createdBy
        });
    }

    async getCustomCommands(guildId) {
        return this.findRecords('custom_commands', { guild_id: guildId });
    }

    async removeCustomCommand(guildId, commandName) {
        return this.deleteRecord('custom_commands', {
            guild_id: guildId,
            command_name: commandName
        });
    }

    // Moderation Action Logging Methods
    async addModerationAction(guildId, userId, moderatorId, actionType, actionReason, actionDuration = null) {
        return this.createRecord('moderation_actions', {
            guild_id: guildId,
            user_id: userId,
            moderator_id: moderatorId,
            action_type: actionType,
            action_data: JSON.stringify({ reason: actionReason, duration: actionDuration })
        });
    }

    async getModerationActions(guildId, limit = 50) {
        return this.findRecords('moderation_actions', 
            { guild_id: guildId }, 
            { 
                orderBy: 'created_at DESC',
                limit: limit
            }
        );
    }

    // Support Ticket Methods
    async createSupportTicket(userId, username, category, subject, messageContent) {
        const ticketId = this.generateTicketId();
        
        await this.createRecord('support_tickets', {
            ticket_id: ticketId,
            user_id: userId,
            username: username,
            category: category,
            subject: subject
        });

        await this.createRecord('ticket_messages', {
            ticket_id: ticketId,
            user_id: userId,
            username: username,
            message_content: messageContent,
            is_staff_member: 0
        });

        return ticketId;
    }

    async getAllSupportTickets(status = null) {
        const searchCriteria = status ? { status } : {};
        return this.findRecords('support_tickets', searchCriteria, { orderBy: 'created_at DESC' });
    }

    async getUserSupportTickets(userId) {
        return this.findRecords('support_tickets', { user_id: userId }, { orderBy: 'created_at DESC' });
    }

    async getSupportTicket(ticketId) {
        const ticket = await this.findRecords('support_tickets', { ticket_id: ticketId }, { singleRecord: true });
        if (!ticket) return null;

        const messages = await this.findRecords('ticket_messages', 
            { ticket_id: ticketId }, 
            { orderBy: 'created_at ASC' }
        );

        ticket.messages = messages;
        return ticket;
    }

    async addTicketMessage(ticketId, userId, username, messageContent, isStaffMember = false) {
        await this.createRecord('ticket_messages', {
            ticket_id: ticketId,
            user_id: userId,
            username: username,
            message_content: messageContent,
            is_staff_member: isStaffMember ? 1 : 0
        });

        await this.updateRecord('support_tickets', 
            { updated_at: new Date().toISOString() },
            { ticket_id: ticketId }
        );
    }

    async updateTicketStatus(ticketId, status, closedBy = null) {
        const updateData = { 
            status: status, 
            updated_at: new Date().toISOString() 
        };

        if (status === 'closed' && closedBy) {
            updateData.closed_at = new Date().toISOString();
            updateData.closed_by = closedBy;
        }

        return this.updateRecord('support_tickets', updateData, { ticket_id: ticketId });
    }

    async assignSupportTicket(ticketId, staffId) {
        return this.updateRecord('support_tickets', 
            { 
                assigned_to: staffId, 
                updated_at: new Date().toISOString() 
            },
            { ticket_id: ticketId }
        );
    }

    async updateTicketPriority(ticketId, priorityLevel) {
        return this.updateRecord('support_tickets', 
            { 
                priority_level: priorityLevel, 
                updated_at: new Date().toISOString() 
            },
            { ticket_id: ticketId }
        );
    }

    async getSupportTicketStatistics() {
        const allTickets = await this.findRecords('support_tickets');
        
        return {
            total: allTickets.length,
            open: allTickets.filter(t => t.status === 'open').length,
            in_progress: allTickets.filter(t => t.status === 'in_progress').length,
            closed: allTickets.filter(t => t.status === 'closed').length
        };
    }

    generateTicketId() {
        return 'TKT-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substr(2, 5).toUpperCase();
    }

    // Cleanup and utilities
    async removeGuildData(guildId) {
        const tables = ['guild_configurations', 'moderation_warnings', 'custom_commands', 'moderation_actions'];
        
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                tables.forEach(table => {
                    this.db.run(`DELETE FROM ${table} WHERE guild_id = ?`, [guildId]);
                });
                resolve(true);
            });
        });
    }

    closeConnection() {
        this.db.close((err) => {
            if (err) {
                console.error('❌ Database close error:', err.message);
            } else {
                console.log('✅ Database connection closed');
            }
        });
    }
}

module.exports = DatabaseManager;