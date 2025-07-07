// Main JavaScript file for CS Bot

class CSBot {
    constructor() {
        this.socket = null;
        this.currentChat = null;
        this.init();
    }

    init() {
        // Initialize Socket.IO if available
        if (typeof io !== 'undefined') {
            this.socket = io();
            this.setupSocketListeners();
        }

        // Initialize page-specific functionality
        this.initPageFunctionality();
    }

    setupSocketListeners() {
        // WhatsApp status updates
        this.socket.on('whatsapp-status', (data) => {
            this.updateWhatsAppStatus(data.connected);
        });

        // QR code updates
        this.socket.on('qr-code', (qrData) => {
            this.displayQRCode(qrData);
        });

        // New incoming messages
        this.socket.on('new-message', (data) => {
            this.handleNewMessage(data);
        });

        // Message sent confirmation
        this.socket.on('message-sent', (data) => {
            this.handleMessageSent(data);
        });

        // Connection status
        this.socket.on('connect', () => {
            console.log('Connected to server');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
        });
    }

    updateWhatsAppStatus(connected) {
        const statusElement = document.getElementById('whatsapp-status');
        if (statusElement) {
            if (connected) {
                statusElement.textContent = 'Connected';
                statusElement.className = 'badge bg-success';
            } else {
                statusElement.textContent = 'Disconnected';
                statusElement.className = 'badge bg-danger';
            }
        }
    }

    displayQRCode(qrData) {
        const qrContainer = document.getElementById('qr-code-container');
        const qrImage = document.getElementById('qr-code-image');
        
        if (qrContainer && qrImage) {
            if (qrData) {
                qrImage.src = qrData;
                qrContainer.style.display = 'flex';
            } else {
                qrContainer.style.display = 'none';
            }
        }
    }

    handleNewMessage(data) {
        // Update chat if currently viewing this contact
        if (this.currentChat === data.phone) {
            this.addMessageToChat(data, 'incoming');
        }

        // Update contact list with new message indicator
        this.updateContactList(data.phone, data.message);

        // Show notification
        this.showNotification(`New message from ${data.phone}`, data.message);
    }

    handleMessageSent(data) {
        // Update chat if currently viewing this contact
        if (this.currentChat === data.phone) {
            this.addMessageToChat(data, data.isFromBot ? 'bot' : 'outgoing');
        }
    }

    addMessageToChat(data, type) {
        const chatContainer = document.getElementById('chat-messages');
        if (!chatContainer) return;

        const messageElement = document.createElement('div');
        messageElement.className = `message ${type} new-message`;
        
        const timeString = new Date(data.timestamp).toLocaleTimeString();
        
        messageElement.innerHTML = `
            <div>${this.escapeHtml(data.message)}</div>
            <div class="message-time">${timeString}</div>
        `;

        chatContainer.appendChild(messageElement);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    updateContactList(phone, lastMessage) {
        const contactElement = document.querySelector(`[data-phone="${phone}"]`);
        if (contactElement) {
            const lastMessageElement = contactElement.querySelector('.last-message');
            if (lastMessageElement) {
                lastMessageElement.textContent = lastMessage.length > 30 ? lastMessage.substring(0, 30) + '...' : lastMessage;
            }
        }
    }

    showNotification(title, message) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, {
                body: message,
                icon: '/favicon.ico'
            });
        }
    }

    initPageFunctionality() {
        // Chat page functionality
        this.initChatPage();
        
        // Bulk messaging functionality
        this.initBulkPage();
        
        // Settings functionality
        this.initSettingsPage();

        // File upload functionality
        this.initFileUpload();

        // Request notification permission
        this.requestNotificationPermission();
    }

    initChatPage() {
        const chatForm = document.getElementById('chat-form');
        const chatInput = document.getElementById('chat-input');
        const contactItems = document.querySelectorAll('.contact-item');

        if (chatForm && chatInput) {
            chatForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.sendMessage();
            });

            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }

        contactItems.forEach(item => {
            item.addEventListener('click', () => {
                this.selectContact(item);
            });
        });
    }

    selectContact(contactElement) {
        // Remove active class from all contacts
        document.querySelectorAll('.contact-item').forEach(item => {
            item.classList.remove('active');
        });

        // Add active class to selected contact
        contactElement.classList.add('active');

        const phone = contactElement.dataset.phone;
        this.currentChat = phone;

        // Load chat messages
        this.loadChatMessages(phone);
    }

    async loadChatMessages(phone) {
        try {
            const response = await fetch(`/dashboard/chat/messages/${phone}`);
            const data = await response.json();

            if (data.success) {
                const chatContainer = document.getElementById('chat-messages');
                if (chatContainer) {
                    chatContainer.innerHTML = '';

                    data.messages.forEach(message => {
                        const messageType = message.message_type === 'incoming' ? 'incoming' : 
                                          message.is_from_bot ? 'bot' : 'outgoing';
                        
                        this.addMessageToChat({
                            message: message.content,
                            timestamp: message.timestamp
                        }, messageType);
                    });
                }
            }
        } catch (error) {
            console.error('Error loading chat messages:', error);
        }
    }

    async sendMessage() {
        const chatInput = document.getElementById('chat-input');
        const message = chatInput.value.trim();

        if (!message || !this.currentChat) return;

        try {
            const response = await fetch('/dashboard/chat/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    phone: this.currentChat,
                    message: message
                })
            });

            const data = await response.json();

            if (data.success) {
                chatInput.value = '';
                // Message will be added via socket event
            } else {
                alert('Failed to send message: ' + data.error);
            }
        } catch (error) {
            console.error('Error sending message:', error);
            alert('Error sending message');
        }
    }

    initBulkPage() {
        const campaignForm = document.getElementById('campaign-form');
        const fileInput = document.getElementById('excel-file');

        if (campaignForm) {
            campaignForm.addEventListener('submit', (e) => {
                if (fileInput && !fileInput.files.length) {
                    e.preventDefault();
                    alert('Please select an Excel file');
                }
            });
        }

        // Start campaign buttons
        document.querySelectorAll('.start-campaign-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const campaignId = e.target.dataset.campaignId;
                this.startCampaign(campaignId);
            });
        });
    }

    async startCampaign(campaignId) {
        if (!confirm('Are you sure you want to start this campaign?')) return;

        try {
            const response = await fetch(`/bulk/campaign/${campaignId}/start`, {
                method: 'POST'
            });

            const data = await response.json();

            if (data.success) {
                alert('Campaign started successfully!');
                location.reload();
            } else {
                alert('Failed to start campaign: ' + data.error);
            }
        } catch (error) {
            console.error('Error starting campaign:', error);
            alert('Error starting campaign');
        }
    }

    initSettingsPage() {
        const settingsForm = document.getElementById('settings-form');
        
        if (settingsForm) {
            settingsForm.addEventListener('submit', (e) => {
                // Add any client-side validation here
            });
        }
    }

    initFileUpload() {
        const fileUploadAreas = document.querySelectorAll('.file-upload-area');
        
        fileUploadAreas.forEach(area => {
            area.addEventListener('dragover', (e) => {
                e.preventDefault();
                area.classList.add('dragover');
            });

            area.addEventListener('dragleave', () => {
                area.classList.remove('dragover');
            });

            area.addEventListener('drop', (e) => {
                e.preventDefault();
                area.classList.remove('dragover');
                
                const files = e.dataTransfer.files;
                const fileInput = area.querySelector('input[type="file"]');
                
                if (fileInput && files.length > 0) {
                    fileInput.files = files;
                    this.handleFileSelect(fileInput);
                }
            });
        });

        const fileInputs = document.querySelectorAll('input[type="file"]');
        fileInputs.forEach(input => {
            input.addEventListener('change', () => {
                this.handleFileSelect(input);
            });
        });
    }

    handleFileSelect(input) {
        const file = input.files[0];
        if (!file) return;

        const fileName = file.name;
        const fileSize = this.formatFileSize(file.size);
        
        // Display file info
        const fileInfo = input.parentElement.querySelector('.file-info');
        if (fileInfo) {
            fileInfo.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-file-excel me-2"></i>
                    Selected: ${fileName} (${fileSize})
                </div>
            `;
        }
    }

    requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.csBot = new CSBot();
});

// Utility functions for global use
window.csBot = window.csBot || {};

// Toggle manual mode
window.toggleManualMode = async function() {
    try {
        const response = await fetch('/dashboard/settings/toggle-manual', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        if (data.success) {
            location.reload();
        } else {
            alert('Failed to toggle manual mode');
        }
    } catch (error) {
        console.error('Error toggling manual mode:', error);
        alert('Error toggling manual mode');
    }
};