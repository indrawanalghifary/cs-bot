const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');
const Database = require('../database/database');

const router = express.Router();
const db = new Database();

// Apply auth middleware
router.use(requireAuth);

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../public/uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only Excel files are allowed'), false);
    }
};

const upload = multer({ 
    storage,
    fileFilter,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 // 10MB
    }
});

// Bulk messaging page
router.get('/', async (req, res) => {
    try {
        await db.initialize();
        
        // Get recent campaigns
        const campaigns = await db.all(`
            SELECT * FROM bulk_campaigns 
            ORDER BY created_at DESC 
            LIMIT 10
        `);
        
        res.render('dashboard/bulk', {
            title: 'Bulk Messaging - CS Bot',
            campaigns
        });
    } catch (error) {
        console.error('Bulk page error:', error);
        req.flash('error_msg', 'Error loading bulk messaging page');
        res.redirect('/dashboard');
    }
});

// Upload and process Excel file
router.post('/upload', upload.single('excelFile'), async (req, res) => {
    try {
        if (!req.file) {
            req.flash('error_msg', 'Please select an Excel file');
            return res.redirect('/bulk');
        }

        const { campaignName, message } = req.body;
        
        if (!campaignName || !message) {
            req.flash('error_msg', 'Campaign name and message are required');
            return res.redirect('/bulk');
        }

        // Read Excel file
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet);

        if (data.length === 0) {
            req.flash('error_msg', 'Excel file is empty or invalid format');
            return res.redirect('/bulk');
        }

        // Validate Excel structure (should have 'phone' and optionally 'name' columns)
        const firstRow = data[0];
        if (!firstRow.phone && !firstRow.Phone && !firstRow.PHONE) {
            req.flash('error_msg', 'Excel file must have a "phone" column');
            return res.redirect('/bulk');
        }

        await db.initialize();

        // Create campaign
        const campaign = await db.run(
            'INSERT INTO bulk_campaigns (name, message_template, total_contacts) VALUES (?, ?, ?)',
            [campaignName, message, data.length]
        );

        const campaignId = campaign.id;

        // Insert contacts
        for (const row of data) {
            const phone = row.phone || row.Phone || row.PHONE;
            const name = row.name || row.Name || row.NAME || null;
            
            if (phone) {
                // Clean phone number
                const cleanPhone = phone.toString().replace(/\D/g, '');
                
                if (cleanPhone.length >= 10) {
                    await db.run(
                        'INSERT INTO bulk_campaign_contacts (campaign_id, phone, name) VALUES (?, ?, ?)',
                        [campaignId, cleanPhone, name]
                    );
                }
            }
        }

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        req.flash('success_msg', `Campaign "${campaignName}" created with ${data.length} contacts`);
        res.redirect('/bulk/campaign/' + campaignId);

    } catch (error) {
        console.error('Excel upload error:', error);
        req.flash('error_msg', 'Error processing Excel file');
        res.redirect('/bulk');
    }
});

// View campaign details
router.get('/campaign/:id', async (req, res) => {
    try {
        await db.initialize();
        const { id } = req.params;
        
        const campaign = await db.get('SELECT * FROM bulk_campaigns WHERE id = ?', [id]);
        if (!campaign) {
            req.flash('error_msg', 'Campaign not found');
            return res.redirect('/bulk');
        }
        
        const contacts = await db.all(
            'SELECT * FROM bulk_campaign_contacts WHERE campaign_id = ? ORDER BY id',
            [id]
        );
        
        res.render('dashboard/campaign', {
            title: `Campaign: ${campaign.name} - CS Bot`,
            campaign,
            contacts
        });
        
    } catch (error) {
        console.error('Campaign view error:', error);
        req.flash('error_msg', 'Error loading campaign');
        res.redirect('/bulk');
    }
});

// Start campaign
router.post('/campaign/:id/start', async (req, res) => {
    try {
        await db.initialize();
        const { id } = req.params;
        
        const campaign = await db.get('SELECT * FROM bulk_campaigns WHERE id = ?', [id]);
        if (!campaign) {
            return res.json({
                success: false,
                error: 'Campaign not found'
            });
        }
        
        if (campaign.status !== 'pending') {
            return res.json({
                success: false,
                error: 'Campaign already started or completed'
            });
        }
        
        // Update campaign status
        await db.run('UPDATE bulk_campaigns SET status = ? WHERE id = ?', ['running', id]);
        
        // Get campaign contacts
        const contacts = await db.all(
            'SELECT * FROM bulk_campaign_contacts WHERE campaign_id = ? AND status = ?',
            [id, 'pending']
        );
        
        // Here you would integrate with WhatsApp service to send messages
        // For now, just simulate the process
        
        res.json({
            success: true,
            message: 'Campaign started successfully',
            totalContacts: contacts.length
        });
        
        // Simulate bulk sending process
        setTimeout(async () => {
            try {
                // Update campaign as completed
                await db.run(
                    'UPDATE bulk_campaigns SET status = ?, sent_count = ? WHERE id = ?',
                    ['completed', contacts.length, id]
                );
                
                // Update all contacts as sent
                await db.run(
                    'UPDATE bulk_campaign_contacts SET status = ?, sent_at = CURRENT_TIMESTAMP WHERE campaign_id = ?',
                    ['sent', id]
                );
                
            } catch (error) {
                console.error('Campaign completion error:', error);
            }
        }, 5000);
        
    } catch (error) {
        console.error('Start campaign error:', error);
        res.json({
            success: false,
            error: 'Failed to start campaign'
        });
    }
});

// Delete campaign
router.delete('/campaign/:id', async (req, res) => {
    try {
        await db.initialize();
        const { id } = req.params;
        
        // Delete campaign contacts first
        await db.run('DELETE FROM bulk_campaign_contacts WHERE campaign_id = ?', [id]);
        
        // Delete campaign
        await db.run('DELETE FROM bulk_campaigns WHERE id = ?', [id]);
        
        res.json({
            success: true,
            message: 'Campaign deleted successfully'
        });
        
    } catch (error) {
        console.error('Delete campaign error:', error);
        res.json({
            success: false,
            error: 'Failed to delete campaign'
        });
    }
});

module.exports = router;