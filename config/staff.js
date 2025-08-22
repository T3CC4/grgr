// config/staff.js - Production Staff configuration (NO MOCK DATA)
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
    
    // Custom bios for specific team members
    customBios: {
        // Example: '621711119421276160': 'Founder and lead developer of Omnia Bot.',
        // Add custom bios for specific Discord IDs here
    },
    
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
    },

    // Get all staff IDs
    getAllStaffIds() {
        return [
            ...this.owners,
            ...this.admins,
            ...this.moderators,
            ...this.support
        ];
    },

    // Get staff bio
    getStaffBio(userId, role) {
        // Check for custom bio first
        if (this.customBios[userId]) {
            return this.customBios[userId];
        }

        // Default bios based on role
        const roleBios = {
            'Owner': 'Founder and lead developer, responsible for the overall vision and development of Omnia Bot.',
            'Admin': 'Senior team member helping to manage and improve Omnia Bot.',
            'Moderator': 'Experienced moderator ensuring quality and helping users.',
            'Support': 'Dedicated support team member helping users with questions and issues.'
        };

        return roleBios[role] || `Team ${role} working to make Omnia Bot better every day.`;
    },

    // Get team stats
    getTeamStats() {
        return {
            owners: this.owners.length,
            admins: this.admins.length,
            moderators: this.moderators.length,
            support: this.support.length,
            total: this.getAllStaffIds().length
        };
    },

    // Fetch team members with real Discord data
    async getTeamMembersWithDiscordData(client) {
        const allStaffIds = this.getAllStaffIds();
        const teamMembers = [];
        let onlineCount = 0;

        if (allStaffIds.length === 0) {
            return {
                members: [],
                stats: { total: 0, online: 0, ...this.getTeamStats() }
            };
        }

        // Fetch real Discord user info for each staff member
        for (const userId of allStaffIds) {
            try {
                const user = await client.users.fetch(userId);
                if (user) {
                    const role = this.getRole(userId);
                    
                    // Get presence info if user is in a mutual guild
                    let status = 'offline';
                    let displayName = user.username;
                    
                    // Check if user is in any guild with the bot to get presence
                    const mutualGuild = client.guilds.cache.find(guild => 
                        guild.members.cache.has(userId)
                    );
                    
                    if (mutualGuild) {
                        const member = mutualGuild.members.cache.get(userId);
                        if (member) {
                            status = member.presence?.status || 'offline';
                            displayName = member.displayName || user.username;
                            if (status === 'online' || status === 'idle' || status === 'dnd') {
                                onlineCount++;
                            }
                        }
                    }

                    teamMembers.push({
                        id: user.id,
                        username: user.username,
                        discriminator: user.discriminator,
                        tag: user.tag,
                        displayName: displayName,
                        avatarURL: user.displayAvatarURL({ size: 256, dynamic: true }),
                        role: role,
                        status: status,
                        bio: this.getStaffBio(userId, role)
                    });
                }
            } catch (userError) {
                console.warn(`[STAFF] Could not fetch user ${userId}:`, userError.message);
                // Skip users that can't be fetched instead of adding fake data
            }
        }

        // Sort by role hierarchy (owners first, then admins, etc.)
        const roleOrder = { 'Owner': 0, 'Admin': 1, 'Moderator': 2, 'Support': 3 };
        teamMembers.sort((a, b) => {
            const aOrder = roleOrder[a.role] || 999;
            const bOrder = roleOrder[b.role] || 999;
            return aOrder - bOrder;
        });

        return {
            members: teamMembers,
            stats: {
                total: teamMembers.length,
                online: onlineCount,
                ...this.getTeamStats()
            }
        };
    }
};