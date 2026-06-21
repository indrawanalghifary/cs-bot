const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
    constructor() {
        this.dbPath = process.env.DB_PATH || './database/cs-bot.db';
        this.db = null;
    }

    async initialize() {
        // Ensure database directory exists
        const dbDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log('Connected to SQLite database');
                    this.createTables().then(resolve).catch(reject);
                }
            });
        });
    }

    async createTables() {
        const tables = [
            // Users table for authentication
            `CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT DEFAULT 'admin',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Contacts table for storing WhatsApp contacts
            `CREATE TABLE IF NOT EXISTS contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phone TEXT UNIQUE NOT NULL,
                name TEXT,
                status TEXT DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Messages table for storing conversations
            `CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contact_phone TEXT NOT NULL,
                message_type TEXT NOT NULL, -- 'incoming', 'outgoing', 'bulk'
                content TEXT NOT NULL,
                is_from_bot BOOLEAN DEFAULT 0,
                manual_override BOOLEAN DEFAULT 0,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (contact_phone) REFERENCES contacts (phone)
            )`,
            
            // Bulk campaigns table
            `CREATE TABLE IF NOT EXISTS bulk_campaigns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                message_template TEXT NOT NULL,
                total_contacts INTEGER DEFAULT 0,
                sent_count INTEGER DEFAULT 0,
                failed_count INTEGER DEFAULT 0,
                status TEXT DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Bulk campaign contacts
            `CREATE TABLE IF NOT EXISTS bulk_campaign_contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                campaign_id INTEGER NOT NULL,
                phone TEXT NOT NULL,
                name TEXT,
                status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed'
                sent_at DATETIME,
                error_message TEXT,
                FOREIGN KEY (campaign_id) REFERENCES bulk_campaigns (id)
            )`,
            
            // Settings table
            `CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`
        ];

        for (const table of tables) {
            await this.run(table);
        }

        // Insert default settings
        await this.insertDefaultSettings();
    }

    async insertDefaultSettings() {
        const defaultSettings = [
            ['whatsapp_auto_response', 'true'],
            ['ai_enabled', 'true'],
            ['welcome_message', 'Halo! Selamat datang di layanan customer service kami. Ada yang bisa kami bantu?'],
            ['manual_mode', 'false']
        ];

        for (const [key, value] of defaultSettings) {
            await this.run(
                'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
                [key, value]
            );
        }
    }

    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID, changes: this.changes });
                }
            });
        });
    }

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async close() {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    // Convenience methods
    async saveContact(phone, name = null) {
        return this.run(
            'INSERT OR REPLACE INTO contacts (phone, name) VALUES (?, ?)',
            [phone, name]
        );
    }

    async saveMessage(contactPhone, messageType, content, isFromBot = false, manualOverride = false) {
        return this.run(
            'INSERT INTO messages (contact_phone, message_type, content, is_from_bot, manual_override) VALUES (?, ?, ?, ?, ?)',
            [contactPhone, messageType, content, isFromBot, manualOverride]
        );
    }

    async getMessages(contactPhone, limit = 50) {
        return this.all(
            'SELECT * FROM messages WHERE contact_phone = ? ORDER BY timestamp DESC LIMIT ?',
            [contactPhone, limit]
        );
    }

    async getAllContacts() {
        return this.all('SELECT * FROM contacts ORDER BY created_at DESC');
    }

    async getSetting(key) {
        const result = await this.get('SELECT value FROM settings WHERE key = ?', [key]);
        return result ? result.value : null;
    }

    async setSetting(key, value) {
        return this.run(
            'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
            [key, value]
        );
    }
}

module.exports = Database;