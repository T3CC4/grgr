// services/TicketService.js - Replaces database/tickets.js
const { Repository } = require('../database/Repository');

class TicketService extends Repository {
    initTables() {
        super.initTables();
        
        const ticketTables = {
            tickets: `
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
                )`,
            ticket_messages: `
                CREATE TABLE IF NOT EXISTS ticket_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ticket_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    username TEXT NOT NULL,
                    message TEXT NOT NULL,
                    is_staff BOOLEAN DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id)
                )`
        };

        Object.values(ticketTables).forEach(sql => this.db.run(sql));
    }

    generateTicketId() {
        return 'TKT-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substr(2, 5).toUpperCase();
    }

    async createTicket(userId, username, category, subject, message) {
        const ticketId = this.generateTicketId();
        
        await this.create('tickets', {
            ticket_id: ticketId,
            user_id: userId,
            username: username,
            category: category,
            subject: subject
        });

        await this.create('ticket_messages', {
            ticket_id: ticketId,
            user_id: userId,
            username: username,
            message: message,
            is_staff: 0
        });

        return ticketId;
    }

    async getAllTickets(status = null) {
        const conditions = status ? { status } : {};
        return this.find('tickets', conditions, { orderBy: 'created_at DESC' });
    }

    async getUserTickets(userId) {
        return this.find('tickets', { user_id: userId }, { orderBy: 'created_at DESC' });
    }

    async getTicket(ticketId) {
        const ticket = await this.find('tickets', { ticket_id: ticketId }, { single: true });
        if (!ticket) return null;

        const messages = await this.find('ticket_messages', 
            { ticket_id: ticketId }, 
            { orderBy: 'created_at ASC' }
        );

        ticket.messages = messages;
        return ticket;
    }

    async addMessage(ticketId, userId, username, message, isStaff = false) {
        await this.create('ticket_messages', {
            ticket_id: ticketId,
            user_id: userId,
            username: username,
            message: message,
            is_staff: isStaff ? 1 : 0
        });

        await this.update('tickets', 
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

        return this.update('tickets', updateData, { ticket_id: ticketId });
    }

    async assignTicket(ticketId, staffId) {
        return this.update('tickets', 
            { 
                assigned_to: staffId, 
                updated_at: new Date().toISOString() 
            },
            { ticket_id: ticketId }
        );
    }

    async updatePriority(ticketId, priority) {
        return this.update('tickets', 
            { 
                priority: priority, 
                updated_at: new Date().toISOString() 
            },
            { ticket_id: ticketId }
        );
    }

    async getStats() {
        const allTickets = await this.find('tickets');
        
        return {
            total: allTickets.length,
            open: allTickets.filter(t => t.status === 'open').length,
            in_progress: allTickets.filter(t => t.status === 'in_progress').length,
            closed: allTickets.filter(t => t.status === 'closed').length
        };
    }
}

module.exports = TicketService;