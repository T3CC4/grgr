function validateConfig(config) {
    const required = ['DISCORD_TOKEN', 'CLIENT_ID', 'CLIENT_SECRET', 'SESSION_SECRET'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        console.error('❌ Fehlende Environment Variables:', missing.join(', '));
        console.error('Bitte erstelle eine .env Datei mit allen nötigen Variablen!');
        process.exit(1);
    }
}