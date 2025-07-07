const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Apply auth middleware
router.use(requireAuth);

// WhatsApp status endpoint
router.get('/status', (req, res) => {
    // This will be populated by the WhatsApp service
    res.json({
        connected: false,
        qr: null
    });
});

// Send message endpoint
router.post('/send', async (req, res) => {
    try {
        const { phone, message } = req.body;
        
        if (!phone || !message) {
            return res.json({
                success: false,
                error: 'Phone and message are required'
            });
        }

        // Clean phone number
        const cleanPhone = phone.replace(/\D/g, '');
        
        // Here you would integrate with WhatsApp service
        // For now, return success
        res.json({
            success: true,
            message: 'Message queued for sending'
        });
        
    } catch (error) {
        console.error('WhatsApp send error:', error);
        res.json({
            success: false,
            error: 'Failed to send message'
        });
    }
});

// Disconnect WhatsApp
router.post('/disconnect', async (req, res) => {
    try {
        // Here you would call whatsappService.disconnect()
        res.json({
            success: true,
            message: 'WhatsApp disconnected'
        });
    } catch (error) {
        console.error('WhatsApp disconnect error:', error);
        res.json({
            success: false,
            error: 'Failed to disconnect'
        });
    }
});

// Reconnect WhatsApp
router.post('/reconnect', async (req, res) => {
    try {
        // Here you would call whatsappService.connect()
        res.json({
            success: true,
            message: 'WhatsApp reconnection initiated'
        });
    } catch (error) {
        console.error('WhatsApp reconnect error:', error);
        res.json({
            success: false,
            error: 'Failed to reconnect'
        });
    }
});

module.exports = router;