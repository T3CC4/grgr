class BaseCommand {
    constructor(data, options = {}) {
        this.data = data;
        this.category = options.category || 'Other';
        this.cooldown = options.cooldown || 3;
        this.permissions = options.permissions || [];
        this.requiresHierarchy = options.requiresHierarchy || false;
    }

    async executeWithChecks(interaction, services) {
        try {
            // Permission checks
            if (this.permissions.length > 0) {
                const hasPerms = await PermissionChecker.checkModPermissions(interaction, this.permissions);
                if (!hasPerms) return;
            }

            // Hierarchy checks for moderation commands
            if (this.requiresHierarchy) {
                const target = interaction.options.getUser('user');
                if (target && !await PermissionChecker.checkHierarchy(interaction, target)) return;
            }

            // Execute the actual command
            await this.execute(interaction, services);
            
            // Log successful execution
            console.log(`✅ ${interaction.user.tag} used /${interaction.commandName} in ${interaction.guild?.name || 'DM'}`);
            
        } catch (error) {
            console.error(`❌ Error in ${interaction.commandName}:`, error);
            await this.handleError(interaction, error);
        }
    }

    async handleError(interaction, error) {
        const errorReply = { content: '❌ An error occurred while executing this command!', ephemeral: true };
        
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorReply);
            } else {
                await interaction.reply(errorReply);
            }
        } catch (replyError) {
            console.error('Failed to send error reply:', replyError);
        }
    }

    // Override this in child classes
    async execute(interaction, services) {
        throw new Error('Execute method must be implemented');
    }
}