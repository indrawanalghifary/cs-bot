const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    MessageType,
    MessageOptions
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const Database = require('../database/database');
const AIService = require('../ai/aiService');

class WhatsAppService {
    constructor(io) {
        this.io = io;
        this.sock = null;
        this.qr = null;
        this.isConnected = false;
        this.db = new Database();
        this.aiService = new AIService();
        this.sessionPath = process.env.WHATSAPP_SESSION_PATH || './whatsapp/session';
        
        // Ensure session directory exists
        if (!fs.existsSync(this.sessionPath)) {
            fs.mkdirSync(this.sessionPath, { recursive: true });
        }
    }

    async initialize() {
        await this.db.initialize();
        await this.connect();
    }

    async connect() {
        try {
            const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);

            this.sock = makeWASocket({
                auth: state,
                printQRInTerminal: true,
                logger: {
                    level: 'silent'
                }
            });

            this.sock.ev.on('creds.update', saveCreds);
            
            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    this.qr = qr;
                    try {
                        const qrString = await QRCode.toDataURL(qr);
                        this.io.emit('qr-code', qrString);
                        console.log('QR Code generated');
                    } catch (error) {
                        console.error('QR Code generation error:', error);
                    }
                }

                if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                    
                    this.isConnected = false;
                    this.io.emit('whatsapp-status', { connected: false });
                    
                    console.log('Connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
                    
                    if (shouldReconnect) {
                        setTimeout(() => this.connect(), 5000);
                    }
                } else if (connection === 'open') {
                    this.isConnected = true;
                    this.qr = null;
                    this.io.emit('whatsapp-status', { connected: true });
                    this.io.emit('qr-code', null);
                    console.log('WhatsApp connected successfully');
                }
            });

            this.sock.ev.on('messages.upsert', async (m) => {
                const message = m.messages[0];
                if (!message.key.fromMe && m.type === 'notify') {
                    await this.handleIncomingMessage(message);
                }
            });

        } catch (error) {
            console.error('WhatsApp connection error:', error);
            setTimeout(() => this.connect(), 10000);
        }
    }

    async handleIncomingMessage(message) {
        try {
            const phone = message.key.remoteJid.replace('@s.whatsapp.net', '');
            const messageText = message.message?.conversation || 
                             message.message?.extendedTextMessage?.text || '';

            if (!messageText) return;

            console.log(`Received message from ${phone}: ${messageText}`);

            // Save contact and message to database
            await this.db.saveContact(phone);
            await this.db.saveMessage(phone, 'incoming', messageText);

            // Emit to frontend
            this.io.emit('new-message', {
                phone,
                message: messageText,
                type: 'incoming',
                timestamp: new Date()
            });

            // Check if manual mode is enabled
            const manualMode = await this.db.getSetting('manual_mode');
            if (manualMode === 'true') {
                console.log('Manual mode enabled, not sending auto response');
                return;
            }

            // Check if auto response is enabled
            const autoResponse = await this.db.getSetting('whatsapp_auto_response');
            if (autoResponse === 'true') {
                await this.handleAutoResponse(phone, messageText);
            }

        } catch (error) {
            console.error('Error handling incoming message:', error);
        }
    }

    async handleAutoResponse(phone, messageText) {
        try {
            const aiEnabled = await this.db.getSetting('ai_enabled');
            let responseText;

            if (aiEnabled === 'true') {
                // Get AI response
                responseText = await this.aiService.generateResponse(messageText, phone);
            } else {
                // Use default welcome message
                responseText = await this.db.getSetting('welcome_message') || 
                             'Terima kasih telah menghubungi kami. Kami akan segera membalas pesan Anda.';
            }

            await this.sendMessage(phone, responseText, true);

        } catch (error) {
            console.error('Error in auto response:', error);
            // Send fallback message
            const fallbackMessage = 'Terima kasih telah menghubungi kami. Kami akan segera membalas pesan Anda.';
            await this.sendMessage(phone, fallbackMessage, true);
        }
    }

    async sendMessage(phone, message, isFromBot = false) {
        try {
            if (!this.isConnected || !this.sock) {
                throw new Error('WhatsApp not connected');
            }

            const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
            
            await this.sock.sendMessage(jid, { text: message });
            
            // Save message to database
            await this.db.saveMessage(phone.replace('@s.whatsapp.net', ''), 'outgoing', message, isFromBot);
            
            // Emit to frontend
            this.io.emit('message-sent', {
                phone: phone.replace('@s.whatsapp.net', ''),
                message,
                type: 'outgoing',
                isFromBot,
                timestamp: new Date()
            });

            console.log(`Message sent to ${phone}: ${message}`);
            return true;

        } catch (error) {
            console.error('Error sending message:', error);
            return false;
        }
    }

    async sendBulkMessage(contacts, message, campaignId = null) {
        const results = {
            sent: 0,
            failed: 0,
            errors: []
        };

        for (const contact of contacts) {
            try {
                const success = await this.sendMessage(contact.phone, message);
                if (success) {
                    results.sent++;
                    
                    // Update campaign contact status
                    if (campaignId) {
                        await this.db.run(
                            'UPDATE bulk_campaign_contacts SET status = ?, sent_at = CURRENT_TIMESTAMP WHERE campaign_id = ? AND phone = ?',
                            ['sent', campaignId, contact.phone]
                        );
                    }
                } else {
                    results.failed++;
                    results.errors.push(`Failed to send to ${contact.phone}`);
                    
                    if (campaignId) {
                        await this.db.run(
                            'UPDATE bulk_campaign_contacts SET status = ?, error_message = ? WHERE campaign_id = ? AND phone = ?',
                            ['failed', 'Send failed', campaignId, contact.phone]
                        );
                    }
                }

                // Add delay between messages to avoid spam detection
                await new Promise(resolve => setTimeout(resolve, 2000));

            } catch (error) {
                results.failed++;
                results.errors.push(`Error sending to ${contact.phone}: ${error.message}`);
                
                if (campaignId) {
                    await this.db.run(
                        'UPDATE bulk_campaign_contacts SET status = ?, error_message = ? WHERE campaign_id = ? AND phone = ?',
                        ['failed', error.message, campaignId, contact.phone]
                    );
                }
            }
        }

        return results;
    }

    async disconnect() {
        if (this.sock) {
            await this.sock.logout();
            this.sock = null;
            this.isConnected = false;
        }
    }

    getConnectionStatus() {
        return {
            connected: this.isConnected,
            qr: this.qr
        };
    }
}

module.exports = WhatsAppService;