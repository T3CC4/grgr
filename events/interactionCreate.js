// events/interactionCreate.js - KORRIGIERT
const { Events, Collection } = require('discord.js');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, bot) {
        // Slash Command Handler
        if (interaction.isChatInputCommand()) {
            const command = bot.commands.get(interaction.commandName);

            if (!command) {
                console.error(`❌ Command ${interaction.commandName} not found.`);
                return;
            }

            // Cooldown System
            if (!bot.cooldowns.has(command.data.name)) {
                bot.cooldowns.set(command.data.name, new Collection());
            }

            const now = Date.now();
            const timestamps = bot.cooldowns.get(command.data.name);
            const defaultCooldownDuration = 3;
            const cooldownAmount = (command.cooldown ?? defaultCooldownDuration) * 1000;

            if (timestamps.has(interaction.user.id)) {
                const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;

                if (now < expirationTime) {
                    const expiredTimestamp = Math.round(expirationTime / 1000);
                    return interaction.reply({
                        content: `⏰ Du kannst diesen Command erst wieder <t:${expiredTimestamp}:R> verwenden.`,
                        ephemeral: true,
                    });
                }
            }

            timestamps.set(interaction.user.id, now);
            setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

            try {
                await command.execute(interaction);
                console.log(`✅ ${interaction.user.tag} used /${interaction.commandName} in ${interaction.guild?.name || 'DM'}`);
            } catch (error) {
                console.error(`❌ Error executing ${interaction.commandName}:`, error);
                
                const errorReply = {
                    content: '❌ Es gab einen Fehler beim Ausführen dieses Commands!',
                    ephemeral: true
                };

                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorReply);
                } else {
                    await interaction.reply(errorReply);
                }
            }
        }

        // Select Menu Handler für Help Command
        if (interaction.isStringSelectMenu() && interaction.customId === 'help_category') {
            const category = interaction.values[0];
            const commands = bot.commands.filter(cmd => (cmd.category || 'Andere') === category);
            
            const embed = {
                color: 0x0099ff,
                title: `📋 ${category} Commands`,
                description: commands.map(cmd => 
                    `**/${cmd.data.name}** - ${cmd.data.description}`
                ).join('\n') || 'Keine Commands in dieser Kategorie gefunden.',
                timestamp: new Date().toISOString(),
                footer: {
                    text: `${commands.size} Commands in ${category}`
                }
            };

            await interaction.update({ embeds: [embed], components: [] });
        }

        // Button Handler (für zukünftige Features)
        if (interaction.isButton()) {
            // Hier können Button-Interaktionen behandelt werden
            console.log(`Button clicked: ${interaction.customId}`);
        }

        // Modal Handler (für zukünftige Features)
        if (interaction.isModalSubmit()) {
            // Hier können Modal-Submissions behandelt werden
            console.log(`Modal submitted: ${interaction.customId}`);
        }
    },
};