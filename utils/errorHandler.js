class BotError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}

function handleError(error, interaction) {
    console.error(`[ERROR] ${error.message}`, error);
    
    const errorMessage = {
        'MISSING_PERMISSIONS': 'Du hast nicht die nötigen Berechtigungen!',
        'USER_NOT_FOUND': 'User nicht gefunden!',
        'CHANNEL_NOT_FOUND': 'Channel nicht gefunden!',
        'DEFAULT': 'Ein Fehler ist aufgetreten!'
    };
    
    const message = errorMessage[error.code] || errorMessage.DEFAULT;
    
    if (interaction.replied || interaction.deferred) {
        interaction.followUp({ content: `❌ ${message}`, ephemeral: true });
    } else {
        interaction.reply({ content: `❌ ${message}`, ephemeral: true });
    }
}