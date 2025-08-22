// dashboard/routes/team.js - New file for team API
const express = require('express');
const router = express.Router();

// Team API route
async function setupTeamAPI(client, staff) {
    // Team endpoint
    router.get('/api/about/team', async (req, res) => {
        try {
            console.log('[TEAM API] Loading team members...');
            
            // Collect all staff IDs
            const allStaffIds = [
                ...staff.owners,
                ...staff.admins,
                ...staff.moderators,
                ...staff.support
            ];

            const teamMembers = [];
            let onlineCount = 0;

            // Fetch Discord user info for each staff member
            for (const userId of allStaffIds) {
                try {
                    const user = await client.users.fetch(userId);
                    if (user) {
                        // Get role
                        const role = staff.getRole(userId);
                        
                        // Try to get presence info if user is in a mutual guild
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
                                if (status !== 'offline') onlineCount++;
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
                            joinedAt: null, // Could be extended to track when they joined the team
                            bio: getStaffBio(userId, role) // Custom bio function
                        });
                    }
                } catch (userError) {
                    console.warn(`[TEAM API] Could not fetch user ${userId}:`, userError.message);
                    
                    // Add fallback entry for users that can't be fetched
                    teamMembers.push({
                        id: userId,
                        username: 'Unknown User',
                        discriminator: '0000',
                        tag: 'Unknown User#0000',
                        displayName: 'Unknown User',
                        avatarURL: 'https://cdn.discordapp.com/embed/avatars/0.png',
                        role: staff.getRole(userId),
                        status: 'offline',
                        joinedAt: null,
                        bio: `Team ${staff.getRole(userId)} member.`
                    });
                }
            }

            // Sort by role hierarchy (owners first, then admins, etc.)
            const roleOrder = { 'Owner': 0, 'Admin': 1, 'Moderator': 2, 'Support': 3 };
            teamMembers.sort((a, b) => {
                const aOrder = roleOrder[a.role] || 999;
                const bOrder = roleOrder[b.role] || 999;
                return aOrder - bOrder;
            });

            const response = {
                members: teamMembers,
                stats: {
                    total: teamMembers.length,
                    online: onlineCount,
                    owners: staff.owners.length,
                    admins: staff.admins.length,
                    moderators: staff.moderators.length,
                    support: staff.support.length
                },
                lastUpdated: new Date().toISOString()
            };

            console.log(`[TEAM API] Returning ${teamMembers.length} team members`);
            res.json(response);

        } catch (error) {
            console.error('[TEAM API] Error loading team:', error);
            res.status(500).json({ 
                error: 'Failed to load team members',
                members: [],
                stats: { total: 0, online: 0, owners: 0, admins: 0, moderators: 0, support: 0 }
            });
        }
    });

    return router;
}

// Custom bio function - can be extended
function getStaffBio(userId, role) {
    // You can customize bios per user ID or role
    const customBios = {
        // Add custom bios for specific users
        // '621711119421276160': 'Founder and lead developer of Omnia Bot.',
    };

    if (customBios[userId]) {
        return customBios[userId];
    }

    // Default bios based on role
    const roleBios = {
        'Owner': 'Founder and lead developer, responsible for the overall vision and development of Omnia Bot.',
        'Admin': 'Senior team member helping to manage and improve Omnia Bot.',
        'Moderator': 'Experienced moderator ensuring quality and helping users.',
        'Support': 'Dedicated support team member helping users with questions and issues.'
    };

    return roleBios[role] || `Team ${role} working to make Omnia Bot better every day.`;
}

module.exports = setupTeamAPI;