// config/staff.js - Staff configuration with Discord IDs
module.exports = {
    // Owner - Full access to everything
    // IMPORTANT: Replace with your actual Discord ID!
    owners: [
        '621711119421276160' // Replace this with your Discord ID
    ],
    
    // Admins - Can manage tickets, view all tickets, manage staff
    admins: [
        // Add admin Discord IDs here
    ],
    
    // Moderators - Can manage tickets, close tickets
    moderators: [
        // Add moderator Discord IDs here
    ],
    
    // Support - Can view and respond to tickets
    support: [
        // Add support staff Discord IDs here
    ],
    
    // Check if user has staff permissions
    isStaff(userId) {
        return this.owners.includes(userId) || 
               this.admins.includes(userId) || 
               this.moderators.includes(userId) || 
               this.support.includes(userId);
    },
    
    // Check if user can manage tickets (close, delete)
    canManageTickets(userId) {
        return this.owners.includes(userId) || 
               this.admins.includes(userId) || 
               this.moderators.includes(userId);
    },
    
    // Check if user is admin or owner
    isAdmin(userId) {
        return this.owners.includes(userId) || this.admins.includes(userId);
    },
    
    // Get user's role
    getRole(userId) {
        if (this.owners.includes(userId)) return 'Owner';
        if (this.admins.includes(userId)) return 'Admin';
        if (this.moderators.includes(userId)) return 'Moderator';
        if (this.support.includes(userId)) return 'Support';
        return 'User';
    },
    
    // Get role color for badges
    getRoleColor(userId) {
        if (this.owners.includes(userId)) return 'danger';
        if (this.admins.includes(userId)) return 'warning';
        if (this.moderators.includes(userId)) return 'primary';
        if (this.support.includes(userId)) return 'info';
        return 'secondary';
    }
};