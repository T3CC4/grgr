// services/ErrorManagementService.js - Professional error management
class ErrorManagementService {
    /**
     * Handle command execution errors
     * @param {CommandInteraction} interaction - Discord interaction object
     * @param {Error} error - The error that occurred
     */
    static async handleCommandException(interaction, error) {
        console.error(`[COMMAND ERROR] ${interaction.commandName}:`, {
            user: interaction.user.tag,
            guild: interaction.guild?.name || 'DM',
            error: error.message,
            stack: error.stack
        });

        // Determine error message based on error type
        let errorMessage = '❌ An unexpected error occurred while executing this command!';
        let shouldShowDetails = false;

        if (error.code) {
            switch (error.code) {
                case 10007:
                    errorMessage = '❌ User not found!';
                    break;
                case 10013:
                    errorMessage = '❌ Unknown user!';
                    break;
                case 50013:
                    errorMessage = '❌ Missing permissions to perform this action!';
                    break;
                case 50035:
                    errorMessage = '❌ Invalid form data provided!';
                    break;
                case 50001:
                    errorMessage = '❌ Missing access to perform this action!';
                    break;
                case 10062:
                    errorMessage = '❌ Unknown interaction!';
                    break;
                case 40005:
                    errorMessage = '❌ Request entity too large!';
                    break;
                default:
                    shouldShowDetails = process.env.NODE_ENV === 'development';
            }
        }

        // Add error details in development mode
        if (shouldShowDetails) {
            errorMessage += `\n\`\`\`\n${error.message}\n\`\`\``;
        }

        const errorResponse = { 
            content: errorMessage, 
            ephemeral: true 
        };

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorResponse);
            } else {
                await interaction.reply(errorResponse);
            }
        } catch (replyError) {
            console.error('[ERROR] Failed to send error message:', replyError);
        }

        // Log to external service if configured
        if (process.env.ERROR_WEBHOOK_URL) {
            await this.sendErrorWebhook(error, interaction);
        }
    }

    /**
     * Handle API request errors
     * @param {Response} res - Express response object
     * @param {Error} error - The error that occurred
     * @param {string} endpoint - The API endpoint where error occurred
     */
    static handleAPIException(res, error, endpoint = 'unknown') {
        console.error(`[API ERROR] ${endpoint}:`, {
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });

        let statusCode = 500;
        let errorMessage = 'Internal server error';

        // Determine status code based on error type
        if (error.name === 'ValidationError') {
            statusCode = 400;
            errorMessage = 'Invalid request data';
        } else if (error.message.includes('not found')) {
            statusCode = 404;
            errorMessage = 'Resource not found';
        } else if (error.message.includes('permission') || error.message.includes('unauthorized')) {
            statusCode = 403;
            errorMessage = 'Access denied';
        } else if (error.code === 'ECONNREFUSED') {
            statusCode = 503;
            errorMessage = 'Service unavailable';
        }

        const errorResponse = {
            error: errorMessage,
            timestamp: new Date().toISOString(),
            endpoint: endpoint
        };

        // Add error details in development mode
        if (process.env.NODE_ENV === 'development') {
            errorResponse.details = error.message;
            errorResponse.stack = error.stack;
        }

        res.status(statusCode).json(errorResponse);
    }

    /**
     * Handle database operation errors
     * @param {Error} error - Database error
     * @param {string} operation - Database operation that failed
     * @param {object} context - Additional context information
     */
    static handleDatabaseException(error, operation, context = {}) {
        console.error(`[DATABASE ERROR] ${operation}:`, {
            message: error.message,
            context: context,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });

        // Log database errors to external monitoring service
        if (process.env.DATABASE_ERROR_WEBHOOK) {
            this.sendDatabaseErrorWebhook(error, operation, context);
        }

        // Return standardized error for calling code
        throw new Error(`Database operation failed: ${operation}`);
    }

    /**
     * Handle validation errors
     * @param {string} field - Field that failed validation
     * @param {string} rule - Validation rule that was broken
     * @param {*} value - The invalid value
     */
    static handleValidationError(field, rule, value) {
        const error = new Error(`Validation failed for field '${field}': ${rule}`);
        error.name = 'ValidationError';
        error.field = field;
        error.rule = rule;
        error.value = value;

        console.warn(`[VALIDATION ERROR] ${field}:`, {
            rule: rule,
            value: value,
            timestamp: new Date().toISOString()
        });

        return error;
    }

    /**
     * Handle rate limit errors
     * @param {object} rateLimitInfo - Rate limit information
     * @param {string} identifier - User or IP identifier
     */
    static handleRateLimitError(rateLimitInfo, identifier) {
        console.warn(`[RATE LIMIT] ${identifier}:`, {
            limit: rateLimitInfo.limit,
            remaining: rateLimitInfo.remaining,
            resetTime: rateLimitInfo.resetTime,
            timestamp: new Date().toISOString()
        });

        const error = new Error('Rate limit exceeded');
        error.name = 'RateLimitError';
        error.rateLimitInfo = rateLimitInfo;
        error.identifier = identifier;

        return error;
    }

    /**
     * Send error information to webhook for monitoring
     * @param {Error} error - The error that occurred
     * @param {CommandInteraction} interaction - Discord interaction object
     */
    static async sendErrorWebhook(error, interaction) {
        try {
            const webhookPayload = {
                embeds: [{
                    title: '🚨 Command Error',
                    color: 0xff0000,
                    fields: [
                        {
                            name: 'Command',
                            value: interaction.commandName,
                            inline: true
                        },
                        {
                            name: 'User',
                            value: `${interaction.user.tag} (${interaction.user.id})`,
                            inline: true
                        },
                        {
                            name: 'Guild',
                            value: interaction.guild ? `${interaction.guild.name} (${interaction.guild.id})` : 'DM',
                            inline: true
                        },
                        {
                            name: 'Error',
                            value: `\`\`\`${error.message}\`\`\``,
                            inline: false
                        }
                    ],
                    timestamp: new Date().toISOString()
                }]
            };

            const response = await fetch(process.env.ERROR_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(webhookPayload)
            });

            if (!response.ok) {
                console.error('Failed to send error webhook:', response.statusText);
            }
        } catch (webhookError) {
            console.error('Error sending webhook:', webhookError);
        }
    }

    /**
     * Send database error information to webhook
     * @param {Error} error - Database error
     * @param {string} operation - Database operation
     * @param {object} context - Additional context
     */
    static async sendDatabaseErrorWebhook(error, operation, context) {
        try {
            const webhookPayload = {
                embeds: [{
                    title: '🗃️ Database Error',
                    color: 0xff6600,
                    fields: [
                        {
                            name: 'Operation',
                            value: operation,
                            inline: true
                        },
                        {
                            name: 'Context',
                            value: `\`\`\`json\n${JSON.stringify(context, null, 2)}\`\`\``,
                            inline: false
                        },
                        {
                            name: 'Error',
                            value: `\`\`\`${error.message}\`\`\``,
                            inline: false
                        }
                    ],
                    timestamp: new Date().toISOString()
                }]
            };

            const response = await fetch(process.env.DATABASE_ERROR_WEBHOOK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(webhookPayload)
            });

            if (!response.ok) {
                console.error('Failed to send database error webhook:', response.statusText);
            }
        } catch (webhookError) {
            console.error('Error sending database webhook:', webhookError);
        }
    }

    /**
     * Create standardized error response for APIs
     * @param {string} message - Error message
     * @param {number} statusCode - HTTP status code
     * @param {string} errorCode - Application-specific error code
     * @returns {object} - Standardized error response
     */
    static createErrorResponse(message, statusCode = 500, errorCode = null) {
        return {
            success: false,
            error: {
                message: message,
                code: errorCode,
                statusCode: statusCode,
                timestamp: new Date().toISOString()
            }
        };
    }

    /**
     * Log warning messages with consistent formatting
     * @param {string} component - Component where warning occurred
     * @param {string} message - Warning message
     * @param {object} context - Additional context information
     */
    static logWarning(component, message, context = {}) {
        console.warn(`[WARNING] ${component}: ${message}`, {
            context: context,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Log info messages with consistent formatting
     * @param {string} component - Component logging the message
     * @param {string} message - Info message
     * @param {object} context - Additional context information
     */
    static logInfo(component, message, context = {}) {
        console.log(`[INFO] ${component}: ${message}`, {
            context: context,
            timestamp: new Date().toISOString()
        });
    }
}

module.exports = ErrorManagementService;