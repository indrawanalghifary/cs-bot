const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Import custom modules
const Database = require('./database/database');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const whatsappRoutes = require('./routes/whatsapp');
const bulkRoutes = require('./routes/bulk');
const WhatsAppService = require('./whatsapp/whatsappService');

// Initialize database
const db = new Database();

// Initialize WhatsApp service
const whatsappService = new WhatsAppService(io);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set to true in production with HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

app.use(flash());

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Global variables for templates
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    res.locals.user = req.session.user || null;
    next();
});

// Routes
app.use('/', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/whatsapp', whatsappRoutes);
app.use('/bulk', bulkRoutes);

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', { 
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('404', { message: 'Page not found' });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    
    // Initialize database tables
    try {
        await db.initialize();
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Database initialization failed:', error);
    }
    
    // Initialize WhatsApp service
    try {
        await whatsappService.initialize();
        console.log('WhatsApp service initialized successfully');
    } catch (error) {
        console.error('WhatsApp service initialization failed:', error);
    }
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    await whatsappService.disconnect();
    process.exit(0);
});

module.exports = { app, server, io };