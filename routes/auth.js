const express = require('express');
const { redirectAuth, hashPassword, comparePassword } = require('../middleware/auth');
const Database = require('../database/database');

const router = express.Router();
const db = new Database();

// Login page
router.get('/', redirectAuth, (req, res) => {
    res.redirect('/login');
});

router.get('/login', redirectAuth, (req, res) => {
    res.render('auth/login', { title: 'Login - CS Bot' });
});

// Login process
router.post('/login', redirectAuth, async (req, res) => {
    const { username, password } = req.body;

    try {
        // For initial setup, use environment variables
        if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
            req.session.user = {
                id: 1,
                username: username,
                role: 'admin'
            };
            req.flash('success_msg', 'Logged in successfully');
            return res.redirect('/dashboard');
        }

        // TODO: Implement database user authentication
        req.flash('error_msg', 'Invalid credentials');
        res.redirect('/login');
    } catch (error) {
        console.error('Login error:', error);
        req.flash('error_msg', 'An error occurred during login');
        res.redirect('/login');
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/login');
    });
});

module.exports = router;