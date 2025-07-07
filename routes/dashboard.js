const express = require('express');
const { requireAuth } = require('../middleware/auth');
const Database = require('../database/database');

const router = express.Router();
const db = new Database();

// Apply auth middleware to all dashboard routes
router.use(requireAuth);

// Dashboard home
router.get('/', async (req, res) => {
    try {
        await db.initialize();
        
        // Get statistics
        const totalContacts = await db.all('SELECT COUNT(*) as count FROM contacts');
        const totalMessages = await db.all('SELECT COUNT(*) as count FROM messages');
        const todayMessages = await db.all(`
            SELECT COUNT(*) as count FROM messages 
            WHERE DATE(timestamp) = DATE('now')
        `);
        const recentContacts = await db.all(`
            SELECT c.*, 
                   (SELECT content FROM messages WHERE contact_phone = c.phone ORDER BY timestamp DESC LIMIT 1) as last_message,
                   (SELECT timestamp FROM messages WHERE contact_phone = c.phone ORDER BY timestamp DESC LIMIT 1) as last_message_time
            FROM contacts c 
            ORDER BY c.created_at DESC 
            LIMIT 10
        `);

        res.render('dashboard/index', {
            title: 'Dashboard - CS Bot',
            stats: {
                totalContacts: totalContacts[0].count,
                totalMessages: totalMessages[0].count,
                todayMessages: todayMessages[0].count
            },
            recentContacts
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        req.flash('error_msg', 'Error loading dashboard');
        res.render('dashboard/index', {
            title: 'Dashboard - CS Bot',
            stats: { totalContacts: 0, totalMessages: 0, todayMessages: 0 },
            recentContacts: []
        });
    }
});

// Chat interface
router.get('/chat', async (req, res) => {
    try {
        await db.initialize();
        const contacts = await db.getAllContacts();
        
        res.render('dashboard/chat', {
            title: 'Chat - CS Bot',
            contacts
        });
    } catch (error) {
        console.error('Chat page error:', error);
        req.flash('error_msg', 'Error loading chat page');
        res.redirect('/dashboard');
    }
});

// Get chat messages for a specific contact
router.get('/chat/messages/:phone', async (req, res) => {
    try {
        await db.initialize();
        const { phone } = req.params;
        const messages = await db.getMessages(phone, 100);
        
        res.json({
            success: true,
            messages: messages.reverse() // Show oldest first
        });
    } catch (error) {
        console.error('Get messages error:', error);
        res.json({
            success: false,
            error: 'Failed to load messages'
        });
    }
});

// Send manual message
router.post('/chat/send', async (req, res) => {
    try {
        const { phone, message } = req.body;
        
        if (!phone || !message) {
            return res.json({
                success: false,
                error: 'Phone and message are required'
            });
        }

        // Here you would integrate with WhatsApp service
        // For now, just save to database
        await db.initialize();
        await db.saveMessage(phone, 'outgoing', message, false, true);
        
        res.json({
            success: true,
            message: 'Message sent successfully'
        });
        
    } catch (error) {
        console.error('Send message error:', error);
        res.json({
            success: false,
            error: 'Failed to send message'
        });
    }
});

// Settings page
router.get('/settings', async (req, res) => {
    try {
        await db.initialize();
        
        const settings = {
            whatsapp_auto_response: await db.getSetting('whatsapp_auto_response'),
            ai_enabled: await db.getSetting('ai_enabled'),
            welcome_message: await db.getSetting('welcome_message'),
            manual_mode: await db.getSetting('manual_mode')
        };
        
        res.render('dashboard/settings', {
            title: 'Settings - CS Bot',
            settings
        });
    } catch (error) {
        console.error('Settings page error:', error);
        req.flash('error_msg', 'Error loading settings');
        res.redirect('/dashboard');
    }
});

// Update settings
router.post('/settings', async (req, res) => {
    try {
        await db.initialize();
        
        const { whatsapp_auto_response, ai_enabled, welcome_message, manual_mode } = req.body;
        
        await db.setSetting('whatsapp_auto_response', whatsapp_auto_response === 'on' ? 'true' : 'false');
        await db.setSetting('ai_enabled', ai_enabled === 'on' ? 'true' : 'false');
        await db.setSetting('manual_mode', manual_mode === 'on' ? 'true' : 'false');
        
        if (welcome_message) {
            await db.setSetting('welcome_message', welcome_message);
        }
        
        req.flash('success_msg', 'Settings updated successfully');
        res.redirect('/dashboard/settings');
        
    } catch (error) {
        console.error('Update settings error:', error);
        req.flash('error_msg', 'Error updating settings');
        res.redirect('/dashboard/settings');
    }
});

module.exports = router;