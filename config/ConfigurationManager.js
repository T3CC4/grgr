// config/ConfigurationManager.js - Centralized configuration management
require('dotenv').config();

class ConfigurationManager {
    constructor() {
        this.configuration = this.initializeConfiguration();
        this.validateConfiguration();
    }

    /**
     * Initialize all configuration settings
     * @returns {object} - Complete configuration object
     */
    initializeConfiguration() {
        return {
            application: {
                name: 'Omnia Bot',
                version: process.env.BOT_VERSION || '2.0.0',
                environment: process.env.NODE_ENV || 'development',
                timezone: process.env.TIMEZONE || 'UTC',
                logLevel: process.env.LOG_LEVEL || 'info'
            },

            bot: {
                token: process.env.DISCORD_TOKEN,
                clientId: process.env.CLIENT_ID,
                clientSecret: process.env.CLIENT_SECRET,
                permissions: process.env.BOT_PERMISSIONS || '8',
                intents: this.parseIntents(process.env.BOT_INTENTS),
                owners: this.parseOwners(process.env.BOT_OWNERS),
                commandPrefix: process.env.COMMAND_PREFIX || '!',
                maxCommandCooldown: parseInt(process.env.MAX_COMMAND_COOLDOWN) || 300,
                statusUpdateInterval: parseInt(process.env.STATUS_UPDATE_INTERVAL) || 600000
            },

            database: {
                type: process.env.DATABASE_TYPE || 'sqlite',
                connectionString: process.env.DATABASE_PATH || './database/bot.db',
                backupEnabled: process.env.DATABASE_BACKUP_ENABLED === 'true',
                backupInterval: parseInt(process.env.DATABASE_BACKUP_INTERVAL) || 86400000, // 24 hours
                maxConnections: parseInt(process.env.DATABASE_MAX_CONNECTIONS) || 10,
                queryTimeout: parseInt(process.env.DATABASE_QUERY_TIMEOUT) || 30000
            },

            dashboard: {
                enabled: process.env.DASHBOARD_ENABLED !== 'false',
                port: parseInt(process.env.DASHBOARD_PORT) || 3000,
                host: process.env.DASHBOARD_HOST || 'localhost',
                url: process.env.DASHBOARD_URL || 'http://localhost:3000',
                sessionSecret: process.env.SESSION_SECRET || 'omnia-bot-session-secret',
                sessionMaxAge: parseInt(process.env.SESSION_MAX_AGE) || 604800000, // 7 days
                rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== 'false',
                rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 100,
                rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 900000 // 15 minutes
            },

            api: {
                enabled: process.env.API_ENABLED !== 'false',
                port: parseInt(process.env.BOT_API_PORT) || 3001,
                host: process.env.API_HOST || 'localhost',
                corsOrigins: this.parseCorsOrigins(process.env.CORS_ORIGINS),
                rateLimitEnabled: process.env.API_RATE_LIMIT_ENABLED !== 'false',
                rateLimitMax: parseInt(process.env.API_RATE_LIMIT_MAX) || 1000,
                rateLimitWindow: parseInt(process.env.API_RATE_LIMIT_WINDOW) || 3600000, // 1 hour
                cacheEnabled: process.env.API_CACHE_ENABLED !== 'false',
                cacheTimeout: parseInt(process.env.API_CACHE_TIMEOUT) || 300000 // 5 minutes
            },

            oauth: {
                clientId: process.env.CLIENT_ID,
                clientSecret: process.env.CLIENT_SECRET,
                redirectUri: `${process.env.DASHBOARD_URL || 'http://localhost:3000'}/auth/discord/callback`,
                scopes: this.parseScopes(process.env.OAUTH_SCOPES) || ['identify', 'guilds']
            },

            staff: {
                owners: this.parseStaffList(process.env.STAFF_OWNERS),
                admins: this.parseStaffList(process.env.STAFF_ADMINS),
                moderators: this.parseStaffList(process.env.STAFF_MODERATORS),
                support: this.parseStaffList(process.env.STAFF_SUPPORT),
                customBios: this.parseCustomBios(process.env.STAFF_CUSTOM_BIOS)
            },

            features: {
                musicEnabled: process.env.FEATURE_MUSIC_ENABLED !== 'false',
                moderationEnabled: process.env.FEATURE_MODERATION_ENABLED !== 'false',
                ticketSystemEnabled: process.env.FEATURE_TICKET_SYSTEM_ENABLED !== 'false',
                autoModerationEnabled: process.env.FEATURE_AUTO_MODERATION_ENABLED === 'true',
                welcomeSystemEnabled: process.env.FEATURE_WELCOME_SYSTEM_ENABLED !== 'false',
                levelsSystemEnabled: process.env.FEATURE_LEVELS_SYSTEM_ENABLED === 'true'
            },

            logging: {
                consoleEnabled: process.env.CONSOLE_LOGGING_ENABLED !== 'false',
                fileEnabled: process.env.FILE_LOGGING_ENABLED === 'true',
                logDirectory: process.env.LOG_DIRECTORY || './logs',
                maxLogFiles: parseInt(process.env.MAX_LOG_FILES) || 7,
                maxLogSize: process.env.MAX_LOG_SIZE || '50MB',
                webhookEnabled: process.env.WEBHOOK_LOGGING_ENABLED === 'true',
                webhookUrl: process.env.WEBHOOK_LOGGING_URL
            },

            monitoring: {
                enabled: process.env.MONITORING_ENABLED === 'true',
                metricsPort: parseInt(process.env.METRICS_PORT) || 9090,
                healthCheckEnabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
                performanceMonitoringEnabled: process.env.PERFORMANCE_MONITORING_ENABLED === 'true',
                errorTrackingEnabled: process.env.ERROR_TRACKING_ENABLED === 'true',
                errorWebhookUrl: process.env.ERROR_WEBHOOK_URL
            },

            security: {
                encryptionKey: process.env.ENCRYPTION_KEY,
                jwtSecret: process.env.JWT_SECRET || 'omnia-jwt-secret',
                jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
                passwordSaltRounds: parseInt(process.env.PASSWORD_SALT_ROUNDS) || 12,
                maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
                lockoutDuration: parseInt(process.env.LOCKOUT_DURATION) || 900000 // 15 minutes
            },

            notifications: {
                discordWebhookEnabled: process.env.DISCORD_WEBHOOK_ENABLED === 'true',
                discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
                emailEnabled: process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true',
                emailService: process.env.EMAIL_SERVICE || 'gmail',
                emailHost: process.env.EMAIL_HOST,
                emailPort: parseInt(process.env.EMAIL_PORT) || 587,
                emailUser: process.env.EMAIL_USER,
                emailPassword: process.env.EMAIL_PASSWORD
            }
        };
    }

    /**
     * Validate critical configuration settings
     */
    validateConfiguration() {
        const requiredSettings = [
            { path: 'bot.token', name: 'DISCORD_TOKEN' },
            { path: 'bot.clientId', name: 'CLIENT_ID' },
            { path: 'bot.clientSecret', name: 'CLIENT_SECRET' }
        ];

        const missingSettings = [];

        requiredSettings.forEach(setting => {
            const value = this.getNestedValue(this.configuration, setting.path);
            if (!value || value === '') {
                missingSettings.push(setting.name);
            }
        });

        if (missingSettings.length > 0) {
            throw new Error(`Missing required environment variables: ${missingSettings.join(', ')}`);
        }

        // Validate port numbers
        this.validatePortNumber('dashboard.port', this.configuration.dashboard.port);
        this.validatePortNumber('api.port', this.configuration.api.port);

        // Validate staff configuration
        if (this.configuration.staff.owners.length === 0) {
            console.warn('⚠️ Warning: No bot owners configured. Please set STAFF_OWNERS environment variable.');
        }

        console.log('✅ Configuration validated successfully');
    }

    /**
     * Parse Discord intents from environment variable
     * @param {string} intentsString - Comma-separated intents
     * @returns {string[]} - Array of intent names
     */
    parseIntents(intentsString) {
        if (!intentsString) {
            return [
                'Guilds',
                'GuildMessages',
                'MessageContent',
                'GuildMembers',
                'GuildPresences'
            ];
        }

        return intentsString.split(',').map(intent => intent.trim());
    }

    /**
     * Parse bot owners from environment variable
     * @param {string} ownersString - Comma-separated user IDs
     * @returns {string[]} - Array of user IDs
     */
    parseOwners(ownersString) {
        if (!ownersString) return [];
        return ownersString.split(',').map(id => id.trim()).filter(id => id.length > 0);
    }

    /**
     * Parse CORS origins from environment variable
     * @param {string} originsString - Comma-separated origins
     * @returns {string[]} - Array of origins
     */
    parseCorsOrigins(originsString) {
        if (!originsString) return ['*'];
        return originsString.split(',').map(origin => origin.trim());
    }

    /**
     * Parse OAuth scopes from environment variable
     * @param {string} scopesString - Space-separated scopes
     * @returns {string[]} - Array of scopes
     */
    parseScopes(scopesString) {
        if (!scopesString) return ['identify', 'guilds'];
        return scopesString.split(' ').map(scope => scope.trim());
    }

    /**
     * Parse staff list from environment variable
     * @param {string} staffString - Comma-separated user IDs
     * @returns {string[]} - Array of user IDs
     */
    parseStaffList(staffString) {
        if (!staffString) return [];
        return staffString.split(',').map(id => id.trim()).filter(id => id.length > 0);
    }

    /**
     * Parse custom staff bios from environment variable
     * @param {string} biosString - JSON string of custom bios
     * @returns {object} - Object mapping user IDs to bios
     */
    parseCustomBios(biosString) {
        if (!biosString) return {};
        try {
            return JSON.parse(biosString);
        } catch (error) {
            console.warn('⚠️ Warning: Invalid STAFF_CUSTOM_BIOS JSON format');
            return {};
        }
    }

    /**
     * Get nested configuration value
     * @param {object} obj - Configuration object
     * @param {string} path - Dot-separated path
     * @returns {*} - Configuration value
     */
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current && current[key], obj);
    }

    /**
     * Validate port number
     * @param {string} configPath - Configuration path for error messages
     * @param {number} port - Port number to validate
     */
    validatePortNumber(configPath, port) {
        if (isNaN(port) || port < 1 || port > 65535) {
            throw new Error(`Invalid port number for ${configPath}: ${port}`);
        }
    }

    /**
     * Get configuration by path
     * @param {string} path - Dot-separated configuration path
     * @returns {*} - Configuration value
     */
    get(path) {
        return this.getNestedValue(this.configuration, path);
    }

    /**
     * Set configuration value by path
     * @param {string} path - Dot-separated configuration path
     * @param {*} value - Value to set
     */
    set(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((current, key) => {
            if (!current[key]) current[key] = {};
            return current[key];
        }, this.configuration);
        
        target[lastKey] = value;
    }

    /**
     * Get all configuration
     * @returns {object} - Complete configuration object
     */
    getAll() {
        return this.configuration;
    }

    /**
     * Get configuration for specific component
     * @param {string} component - Component name (bot, dashboard, api, etc.)
     * @returns {object} - Component configuration
     */
    getComponent(component) {
        return this.configuration[component] || {};
    }

    /**
     * Check if feature is enabled
     * @param {string} feature - Feature name
     * @returns {boolean} - Whether feature is enabled
     */
    isFeatureEnabled(feature) {
        return this.configuration.features[feature] || false;
    }

    /**
     * Check if environment is development
     * @returns {boolean} - Whether in development mode
     */
    isDevelopment() {
        return this.configuration.application.environment === 'development';
    }

    /**
     * Check if environment is production
     * @returns {boolean} - Whether in production mode
     */
    isProduction() {
        return this.configuration.application.environment === 'production';
    }

    /**
     * Get database configuration with connection options
     * @returns {object} - Database configuration object
     */
    getDatabaseConfig() {
        return {
            ...this.configuration.database,
            options: {
                logging: this.isDevelopment(),
                pool: {
                    max: this.configuration.database.maxConnections,
                    min: 0,
                    acquire: this.configuration.database.queryTimeout,
                    idle: 10000
                }
            }
        };
    }

    /**
     * Get Redis configuration (if Redis is configured)
     * @returns {object|null} - Redis configuration or null
     */
    getRedisConfig() {
        const redisUrl = process.env.REDIS_URL;
        const redisHost = process.env.REDIS_HOST;
        const redisPort = process.env.REDIS_PORT;

        if (redisUrl) {
            return { url: redisUrl };
        } else if (redisHost && redisPort) {
            return {
                host: redisHost,
                port: parseInt(redisPort),
                password: process.env.REDIS_PASSWORD,
                db: parseInt(process.env.REDIS_DB) || 0
            };
        }

        return null;
    }

    /**
     * Generate bot invite URL
     * @param {string} guildId - Optional guild ID for pre-selection
     * @returns {string} - Bot invite URL
     */
    getBotInviteUrl(guildId = '') {
        const baseUrl = 'https://discord.com/api/oauth2/authorize';
        const params = new URLSearchParams({
            client_id: this.configuration.bot.clientId,
            permissions: this.configuration.bot.permissions,
            scope: 'bot applications.commands'
        });

        if (guildId) {
            params.set('guild_id', guildId);
        }

        return `${baseUrl}?${params.toString()}`;
    }

    /**
     * Export configuration for external services
     * @param {boolean} includeSensitive - Whether to include sensitive data
     * @returns {object} - Exported configuration
     */
    export(includeSensitive = false) {
        const exported = JSON.parse(JSON.stringify(this.configuration));

        if (!includeSensitive) {
            // Remove sensitive information
            delete exported.bot.token;
            delete exported.bot.clientSecret;
            delete exported.dashboard.sessionSecret;
            delete exported.security.encryptionKey;
            delete exported.security.jwtSecret;
            delete exported.notifications.emailPassword;
        }

        return exported;
    }
}

// Create singleton instance
const configurationManager = new ConfigurationManager();

module.exports = configurationManager;