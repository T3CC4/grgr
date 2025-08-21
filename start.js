// start.js
const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Discord Bot and Dashboard...\n');

// Bot Process starten
const botProcess = spawn('node', ['bot.js'], {
    stdio: 'pipe',
    cwd: process.cwd()
});

// Dashboard Process starten
const dashboardProcess = spawn('node', ['dashboard/server.js'], {
    stdio: 'pipe',
    cwd: process.cwd()
});

// Bot Output handling
botProcess.stdout.on('data', (data) => {
    process.stdout.write(`[BOT] ${data}`);
});

botProcess.stderr.on('data', (data) => {
    process.stderr.write(`[BOT ERROR] ${data}`);
});

botProcess.on('close', (code) => {
    console.log(`\n❌ Bot process exited with code ${code}`);
    if (code !== 0) {
        console.log('🔄 Restarting bot in 5 seconds...');
        setTimeout(() => {
            console.log('♻️ Restarting bot...');
            // Hier könntest du den Bot neu starten
        }, 5000);
    }
});

// Dashboard Output handling
dashboardProcess.stdout.on('data', (data) => {
    process.stdout.write(`[DASHBOARD] ${data}`);
});

dashboardProcess.stderr.on('data', (data) => {
    process.stderr.write(`[DASHBOARD ERROR] ${data}`);
});

dashboardProcess.on('close', (code) => {
    console.log(`\n❌ Dashboard process exited with code ${code}`);
    if (code !== 0) {
        console.log('🔄 Restarting dashboard in 5 seconds...');
        setTimeout(() => {
            console.log('♻️ Restarting dashboard...');
            // Hier könntest du das Dashboard neu starten
        }, 5000);
    }
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down bot and dashboard...');
    
    botProcess.kill('SIGTERM');
    dashboardProcess.kill('SIGTERM');
    
    setTimeout(() => {
        console.log('✅ Shutdown complete');
        process.exit(0);
    }, 2000);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down...');
    
    botProcess.kill('SIGTERM');
    dashboardProcess.kill('SIGTERM');
    
    setTimeout(() => {
        process.exit(0);
    }, 2000);
});

console.log('✅ Both processes started!');
console.log('📊 Dashboard: http://localhost:3000');
console.log('🤖 Bot: Starting...');
console.log('\nPress Ctrl+C to stop both services\n');