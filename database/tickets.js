// dashboard/routes/tickets.js - FIXED with proper module export
const express = require('express');
const router = express.Router();
const path = require('path');

// Import the database modules
let ticketDB;
let staff;

try {
    // Try to load ticket database
    ticketDB = require('../../database/tickets');
} catch (error) {
    console.log('⚠️ Ticket database not initialized, creating stub...');
    // Create stub if not exists
    ticketDB = {
        createTicket: async () => 'TKT-DEMO-001',
        getAllTickets: async () => [],
        getUserTickets: async () => [],
        getTicket: async () => null,
        addMessage: async () => 1,
        updateTicketStatus: async () => 1,
        assignTicket: async () => 1,
        updatePriority: async () => 1,
        getStats: async () => ({ total: 0, open: 0, in_progress: 0, closed: 0 })
    };
}

try {
    // Try to load staff config
    staff = require('../../config/staff');
} catch (error) {
    console.log('⚠️ Staff config not found, creating default...');
    // Create default staff config
    staff = {
        owners: ['YOUR_DISCORD_ID_HERE'], // Replace with your Discord ID
        admins: [],
        moderators: [],
        support: [],
        isStaff: (userId) => staff.owners.includes(userId) || staff.admins.includes(userId) || staff.moderators.includes(userId) || staff.support.includes(userId),
        canManageTickets: (userId) => staff.owners.includes(userId) || staff.admins.includes(userId) || staff.moderators.includes(userId),
        isAdmin: (userId) => staff.owners.includes(userId) || staff.admins.includes(userId),
        getRole: (userId) => {
            if (staff.owners.includes(userId)) return 'Owner';
            if (staff.admins.includes(userId)) return 'Admin';
            if (staff.moderators.includes(userId)) return 'Moderator';
            if (staff.support.includes(userId)) return 'Support';
            return 'User';
        },
        getRoleColor: (userId) => {
            if (staff.owners.includes(userId)) return 'danger';
            if (staff.admins.includes(userId)) return 'warning';
            if (staff.moderators.includes(userId)) return 'primary';
            if (staff.support.includes(userId)) return 'info';
            return 'secondary';
        }
    };
}

// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/auth/discord');
};

// Middleware to check if user is staff
const requireStaff = (req, res, next) => {
    if (req.isAuthenticated() && staff.isStaff(req.user.id)) {
        return next();
    }
    res.status(403).render('error', { 
        error: 'Access denied. Staff only area.',
        user: req.user 
    });
};

// Support page - list user's tickets
router.get('/support', requireAuth, async (req, res) => {
    try {
        const userTickets = await ticketDB.getUserTickets(req.user.id);
        const isStaff = staff.isStaff(req.user.id);
        let allTickets = [];
        let stats = null;
        
        if (isStaff) {
            allTickets = await ticketDB.getAllTickets();
            stats = await ticketDB.getStats();
        }
        
        res.render('support', {
            user: req.user,
            userTickets: userTickets,
            allTickets: allTickets,
            isStaff: isStaff,
            canManage: staff.canManageTickets(req.user.id),
            role: staff.getRole(req.user.id),
            roleColor: staff.getRoleColor(req.user.id),
            stats: stats
        });
    } catch (error) {
        console.error('Error loading support page:', error);
        res.status(500).render('error', {
            error: 'Error loading support page',
            user: req.user
        });
    }
});

// Create new ticket
router.post('/support/ticket/create', requireAuth, async (req, res) => {
    try {
        const { category, subject, message } = req.body;
        
        if (!category || !subject || !message) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        
        const ticketId = await ticketDB.createTicket(
            req.user.id,
            req.user.username,
            category,
            subject,
            message
        );
        
        res.json({ success: true, ticketId: ticketId });
    } catch (error) {
        console.error('Error creating ticket:', error);
        res.status(500).json({ error: 'Failed to create ticket' });
    }
});

// View ticket
router.get('/support/ticket/:ticketId', requireAuth, async (req, res) => {
    try {
        const ticket = await ticketDB.getTicket(req.params.ticketId);
        
        if (!ticket) {
            return res.status(404).render('error', {
                error: 'Ticket not found',
                user: req.user
            });
        }
        
        // Check if user has access to this ticket
        const isStaff = staff.isStaff(req.user.id);
        if (ticket.user_id !== req.user.id && !isStaff) {
            return res.status(403).render('error', {
                error: 'You do not have access to this ticket',
                user: req.user
            });
        }
        
        res.render('ticket', {
            user: req.user,
            ticket: ticket,
            isStaff: isStaff,
            canManage: staff.canManageTickets(req.user.id),
            role: staff.getRole(req.user.id),
            roleColor: staff.getRoleColor(req.user.id)
        });
    } catch (error) {
        console.error('Error loading ticket:', error);
        res.status(500).render('error', {
            error: 'Error loading ticket',
            user: req.user
        });
    }
});

// Add message to ticket
router.post('/support/ticket/:ticketId/message', requireAuth, async (req, res) => {
    try {
        const { message } = req.body;
        const ticket = await ticketDB.getTicket(req.params.ticketId);
        
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        
        // Check if user has access
        const isStaff = staff.isStaff(req.user.id);
        if (ticket.user_id !== req.user.id && !isStaff) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        await ticketDB.addMessage(
            req.params.ticketId,
            req.user.id,
            req.user.username,
            message,
            isStaff
        );
        
        // If staff replied, update status to in_progress
        if (isStaff && ticket.status === 'open') {
            await ticketDB.updateTicketStatus(req.params.ticketId, 'in_progress');
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error adding message:', error);
        res.status(500).json({ error: 'Failed to add message' });
    }
});

// Update ticket status (staff only)
router.post('/support/ticket/:ticketId/status', requireStaff, async (req, res) => {
    try {
        const { status } = req.body;
        const closedBy = status === 'closed' ? req.user.id : null;
        
        await ticketDB.updateTicketStatus(req.params.ticketId, status, closedBy);
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// Assign ticket (staff only)
router.post('/support/ticket/:ticketId/assign', requireStaff, async (req, res) => {
    try {
        const { staffId } = req.body;
        await ticketDB.assignTicket(req.params.ticketId, staffId);
        res.json({ success: true });
    } catch (error) {
        console.error('Error assigning ticket:', error);
        res.status(500).json({ error: 'Failed to assign ticket' });
    }
});

// Update priority (staff only)
router.post('/support/ticket/:ticketId/priority', requireStaff, async (req, res) => {
    try {
        const { priority } = req.body;
        await ticketDB.updatePriority(req.params.ticketId, priority);
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating priority:', error);
        res.status(500).json({ error: 'Failed to update priority' });
    }
});

// IMPORTANT: Export the router
module.exports = router;