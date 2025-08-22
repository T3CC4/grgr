// database/tickets.js - FIXED SQL errors
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class TicketDatabase {
    constructor() {
        this.db = new sqlite3.Database(path.join(__dirname, 'bot.db'));
        this.init();
    }
    
    init() {
        // Create tickets table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_id TEXT UNIQUE NOT NULL,
                user_id TEXT NOT NULL,
                username TEXT NOT NULL,
                category TEXT NOT NULL,
                subject TEXT NOT NULL,
                status TEXT DEFAULT 'open',
                priority TEXT DEFAULT 'normal',
                assigned_to TEXT DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                closed_at DATETIME DEFAULT NULL,
                closed_by TEXT DEFAULT NULL
            )
        `);
        
        // Create ticket messages table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS ticket_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                username TEXT NOT NULL,
                message TEXT NOT NULL,
                is_staff BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id)
            )
        `);
    }
    
    // Generate unique ticket ID
    generateTicketId() {
        return 'TKT-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substr(2, 5).toUpperCase();
    }
    
    // Create new ticket
    async createTicket(userId, username, category, subject, message) {
        return new Promise((resolve, reject) => {
            const ticketId = this.generateTicketId();
            
            this.db.run(`
                INSERT INTO tickets (ticket_id, user_id, username, category, subject)
                VALUES (?, ?, ?, ?, ?)
            `, [ticketId, userId, username, category, subject], function(err) {
                if (err) return reject(err);
                
                // Add initial message
                this.db.run(`
                    INSERT INTO ticket_messages (ticket_id, user_id, username, message, is_staff)
                    VALUES (?, ?, ?, ?, 0)
                `, [ticketId, userId, username, message], (err) => {
                    if (err) return reject(err);
                    resolve(ticketId);
                });
            }.bind(this));
        });
    }
    
    // Get all tickets (for staff)
    async getAllTickets(status = null) {
        return new Promise((resolve, reject) => {
            let query = 'SELECT * FROM tickets';
            let params = [];
            
            if (status) {
                query += ' WHERE status = ?';
                params.push(status);
            }
            
            query += ' ORDER BY created_at DESC';
            
            this.db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }
    
    // Get user's tickets
    async getUserTickets(userId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC',
                [userId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
    }
    
    // Get single ticket with messages
    async getTicket(ticketId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM tickets WHERE ticket_id = ?',
                [ticketId],
                async (err, ticket) => {
                    if (err) return reject(err);
                    if (!ticket) return resolve(null);
                    
                    // Get messages
                    this.db.all(
                        'SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC',
                        [ticketId],
                        (err, messages) => {
                            if (err) return reject(err);
                            ticket.messages = messages || [];
                            resolve(ticket);
                        }
                    );
                }
            );
        });
    }
    
    // Add message to ticket
    async addMessage(ticketId, userId, username, message, isStaff = false) {
        return new Promise((resolve, reject) => {
            this.db.run(`
                INSERT INTO ticket_messages (ticket_id, user_id, username, message, is_staff)
                VALUES (?, ?, ?, ?, ?)
            `, [ticketId, userId, username, message, isStaff ? 1 : 0], function(err) {
                if (err) return reject(err);
                
                // Update ticket updated_at
                this.db.run(
                    'UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE ticket_id = ?',
                    [ticketId],
                    (err) => {
                        if (err) return reject(err);
                        resolve(this.lastID);
                    }
                );
            }.bind(this));
        });
    }
    
    // Update ticket status
    async updateTicketStatus(ticketId, status, closedBy = null) {
        return new Promise((resolve, reject) => {
            let query = 'UPDATE tickets SET status = ?, updated_at = CURRENT_TIMESTAMP';
            let params = [status];
            
            if (status === 'closed' && closedBy) {
                query += ', closed_at = CURRENT_TIMESTAMP, closed_by = ?';
                params.push(closedBy);
            }
            
            query += ' WHERE ticket_id = ?';
            params.push(ticketId);
            
            this.db.run(query, params, function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }
    
    // Assign ticket to staff member
    async assignTicket(ticketId, staffId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE tickets SET assigned_to = ?, updated_at = CURRENT_TIMESTAMP WHERE ticket_id = ?',
                [staffId, ticketId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }
    
    // Update ticket priority
    async updatePriority(ticketId, priority) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE tickets SET priority = ?, updated_at = CURRENT_TIMESTAMP WHERE ticket_id = ?',
                [priority, ticketId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }
    
    // Get ticket statistics - FIXED
    async getStats() {
        return new Promise((resolve, reject) => {
            const stats = {
                total: 0,
                open: 0,
                in_progress: 0,
                closed: 0
            };
            
            // Use separate queries instead of COUNT(*)
            this.db.all('SELECT status FROM tickets', (err, rows) => {
                if (err) return reject(err);
                
                if (rows) {
                    stats.total = rows.length;
                    rows.forEach(row => {
                        if (row.status === 'open') stats.open++;
                        else if (row.status === 'in_progress') stats.in_progress++;
                        else if (row.status === 'closed') stats.closed++;
                    });
                }
                
                resolve(stats);
            });
        });
    }
}

module.exports = new TicketDatabase();