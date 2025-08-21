// dashboard/public/js/main.js

// Global variables
let currentGuildId = null;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', function() {
    // Get guild ID from URL if on guild dashboard
    const pathParts = window.location.pathname.split('/');
    if (pathParts[1] === 'dashboard' && pathParts[2]) {
        currentGuildId = pathParts[2];
        initializeGuildDashboard();
    }
    
    // Initialize tooltips
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
    
    // Initialize command search if on commands page
    if (document.getElementById('commandSearch')) {
        initializeCommandSearch();
    }
    
    // Initialize custom commands if on custom page
    if (document.getElementById('customCommandsList')) {
        loadCustomCommands();
    }
});

// Initialize guild dashboard
function initializeGuildDashboard() {
    if (!currentGuildId) return;
    
    // Load channels and roles
    loadChannels();
    loadRoles();
    
    // Attach form handlers
    attachFormHandlers();
    
    // Load stats
    loadGuildStats();
}

// Load channels for select dropdowns
async function loadChannels() {
    try {
        const response = await fetch(`/api/guild/${currentGuildId}/channels`);
        const channels = await response.json();
        
        const selects = document.querySelectorAll('.channel-select');
        selects.forEach(select => {
            const currentValue = select.value;
            select.innerHTML = '<option value="">Disabled</option>';
            
            // Group channels by category
            const categories = {};
            channels.forEach(channel => {
                const category = channel.parent || 'No Category';
                if (!categories[category]) categories[category] = [];
                categories[category].push(channel);
            });
            
            // Add channels to select
            Object.keys(categories).forEach(category => {
                const optgroup = document.createElement('optgroup');
                optgroup.label = category;
                
                categories[category].forEach(channel => {
                    const option = document.createElement('option');
                    option.value = channel.id;
                    option.textContent = `# ${channel.name}`;
                    optgroup.appendChild(option);
                });
                
                select.appendChild(optgroup);
            });
            
            // Restore previous value
            select.value = currentValue;
        });
    } catch (error) {
        console.error('Error loading channels:', error);
        showAlert('danger', 'Failed to load channels');
    }
}

// Load roles for select dropdowns
async function loadRoles() {
    try {
        const response = await fetch(`/api/guild/${currentGuildId}/roles`);
        const roles = await response.json();
        
        const selects = document.querySelectorAll('.role-select');
        selects.forEach(select => {
            const currentValue = select.value;
            select.innerHTML = '<option value="">Disabled</option>';
            
            roles.forEach(role => {
                const option = document.createElement('option');
                option.value = role.id;
                option.textContent = role.name;
                option.style.color = role.color;
                select.appendChild(option);
            });
            
            // Restore previous value
            select.value = currentValue;
        });
    } catch (error) {
        console.error('Error loading roles:', error);
        showAlert('danger', 'Failed to load roles');
    }
}

// Attach form handlers
function attachFormHandlers() {
    document.querySelectorAll('form[data-config-form]').forEach(form => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveConfig(form);
        });
    });
}

// Save configuration
async function saveConfig(form) {
    const formData = new FormData(form);
    const config = {};
    
    // Process form data
    formData.forEach((value, key) => {
        // Handle checkboxes
        if (form.elements[key].type === 'checkbox') {
            config[key] = form.elements[key].checked;
        } else {
            config[key] = value;
        }
    });
    
    // Add unchecked checkboxes
    form.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        if (!config.hasOwnProperty(checkbox.name)) {
            config[checkbox.name] = false;
        }
    });
    
    try {
        const response = await fetch(`/api/guild/${currentGuildId}/config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });

        const result = await response.json();
        
        if (result.success) {
            showAlert('success', result.message || 'Settings saved successfully!');
        } else {
            showAlert('danger', result.error || 'Failed to save settings');
        }
    } catch (error) {
        console.error('Save error:', error);
        showAlert('danger', 'An error occurred while saving settings');
    }
}

// Load guild statistics
async function loadGuildStats() {
    if (!document.getElementById('guildStats')) return;
    
    try {
        const response = await fetch(`/api/guild/${currentGuildId}/stats`);
        const stats = await response.json();
        
        // Update stats display
        if (document.getElementById('modLogsCount')) {
            document.getElementById('modLogsCount').textContent = stats.modLogs;
        }
        if (document.getElementById('customCommandsCount')) {
            document.getElementById('customCommandsCount').textContent = stats.customCommands;
        }
        
        // Update recent actions
        if (stats.recentActions && document.getElementById('recentActions')) {
            const container = document.getElementById('recentActions');
            container.innerHTML = '';
            
            if (stats.recentActions.length === 0) {
                container.innerHTML = '<p class="text-muted">No recent actions</p>';
            } else {
                stats.recentActions.forEach(action => {
                    const item = document.createElement('div');
                    item.className = 'list-group-item';
                    item.innerHTML = `
                        <div class="d-flex justify-content-between">
                            <div>
                                <strong>${action.action}</strong> - ${action.user_id}
                                <br><small class="text-muted">${action.reason || 'No reason provided'}</small>
                            </div>
                            <small class="text-muted">${new Date(action.created_at).toLocaleString()}</small>
                        </div>
                    `;
                    container.appendChild(item);
                });
            }
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Initialize command search and filters
function initializeCommandSearch() {
    const searchInput = document.getElementById('commandSearch');
    const categoryButtons = document.querySelectorAll('[data-category]');
    const commandItems = document.querySelectorAll('.command-item');
    
    // Search functionality
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        
        commandItems.forEach(item => {
            const name = item.dataset.name.toLowerCase();
            const description = item.querySelector('.text-muted').textContent.toLowerCase();
            
            if (name.includes(searchTerm) || description.includes(searchTerm)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    });
    
    // Category filter
    categoryButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Update active state
            categoryButtons.forEach(b => b.classList.remove('active'));
            button.classList.add('active');
            
            const category = button.dataset.category;
            
            commandItems.forEach(item => {
                if (category === 'all' || item.dataset.category === category) {
                    item.style.display = 'block';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    });
    
    // Command toggle
    document.querySelectorAll('.command-toggle').forEach(toggle => {
        toggle.addEventListener('change', async (e) => {
            const commandName = e.target.dataset.command;
            const enabled = e.target.checked;
            
            try {
                const response = await fetch(`/api/guild/${currentGuildId}/commands/${commandName}/toggle`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ enabled })
                });
                
                const result = await response.json();
                if (!result.success) {
                    e.target.checked = !enabled; // Revert on error
                    showAlert('danger', 'Failed to update command');
                }
            } catch (error) {
                console.error('Error toggling command:', error);
                e.target.checked = !enabled; // Revert on error
                showAlert('danger', 'Failed to update command');
            }
        });
    });
}

// Load custom commands
async function loadCustomCommands() {
    try {
        const response = await fetch(`/api/guild/${currentGuildId}/custom-commands`);
        const commands = await response.json();
        
        const tbody = document.getElementById('customCommandsList');
        
        if (commands.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No custom commands yet</td></tr>';
        } else {
            tbody.innerHTML = '';
            commands.forEach(command => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><code>${command.command_name}</code></td>
                    <td>${command.response}</td>
                    <td>${command.created_by}</td>
                    <td>
                        <button class="btn btn-sm btn-danger" onclick="deleteCustomCommand('${command.command_name}')">
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(row);
            });
        }
    } catch (error) {
        console.error('Error loading custom commands:', error);
        showAlert('danger', 'Failed to load custom commands');
    }
}

// Add custom command
async function addCustomCommand() {
    const name = document.getElementById('customCommandName').value;
    const response = document.getElementById('customCommandResponse').value;
    
    if (!name || !response) {
        showAlert('warning', 'Please fill in all fields');
        return;
    }
    
    try {
        const result = await fetch(`/api/guild/${currentGuildId}/custom-commands`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                commandName: name,
                response: response
            })
        });
        
        const data = await result.json();
        
        if (data.success) {
            showAlert('success', 'Custom command added successfully!');
            document.getElementById('addCustomCommandForm').reset();
            bootstrap.Modal.getInstance(document.getElementById('addCustomCommandModal')).hide();
            loadCustomCommands();
        } else {
            showAlert('danger', data.error || 'Failed to add custom command');
        }
    } catch (error) {
        console.error('Error adding custom command:', error);
        showAlert('danger', 'Failed to add custom command');
    }
}

// Delete custom command
async function deleteCustomCommand(commandName) {
    if (!confirm(`Are you sure you want to delete the command "${commandName}"?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/guild/${currentGuildId}/custom-commands/${commandName}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showAlert('success', 'Custom command deleted successfully!');
            loadCustomCommands();
        } else {
            showAlert('danger', 'Failed to delete custom command');
        }
    } catch (error) {
        console.error('Error deleting custom command:', error);
        showAlert('danger', 'Failed to delete custom command');
    }
}

// Show alert message
function showAlert(type, message) {
    const alertContainer = document.getElementById('alertContainer') || createAlertContainer();
    
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show`;
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    alertContainer.appendChild(alert);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        alert.classList.remove('show');
        setTimeout(() => alert.remove(), 150);
    }, 5000);
}

// Create alert container if it doesn't exist
function createAlertContainer() {
    const container = document.createElement('div');
    container.id = 'alertContainer';
    container.style.position = 'fixed';
    container.style.top = '70px';
    container.style.right = '20px';
    container.style.zIndex = '9999';
    container.style.maxWidth = '400px';
    document.body.appendChild(container);
    return container;
}

// Mobile sidebar toggle
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        sidebar.classList.toggle('active');
    }
}

// Export functions for global use
window.addCustomCommand = addCustomCommand;
window.deleteCustomCommand = deleteCustomCommand;
window.toggleSidebar = toggleSidebar;