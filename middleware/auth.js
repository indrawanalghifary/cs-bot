const bcrypt = require('bcryptjs');

// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    } else {
        req.flash('error_msg', 'Please login to access this page');
        return res.redirect('/login');
    }
};

// Middleware to redirect authenticated users
const redirectAuth = (req, res, next) => {
    if (req.session && req.session.user) {
        return res.redirect('/dashboard');
    } else {
        return next();
    }
};

// Hash password
const hashPassword = async (password) => {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
};

// Compare password
const comparePassword = async (password, hash) => {
    return await bcrypt.compare(password, hash);
};

module.exports = {
    requireAuth,
    redirectAuth,
    hashPassword,
    comparePassword
};