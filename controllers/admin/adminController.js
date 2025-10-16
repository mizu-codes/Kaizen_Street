const User = require('../../models/userSchema');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const pageError = async (req, res) => {
    res.render('admin-error');
}

const loadLogin = (req, res) => {
    if (req.session.admin) {
        return res.redirect('/admin')
    }
    return res.render('admin-login', {
        error: null,
        errors: {},
        message: null
    })
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.render('admin-login', {
                message: 'Please enter both email and password.',
                error: null,
                errors: {}
            });
        }

        const admin = await User.findOne({ email, isAdmin: true });

        if (!admin) {
            return res.render('admin-login', {
                message: 'Invalid admin credentials.',
                error: null,
                errors: {}
            });
        }

        const passwordMatch = await bcrypt.compare(password, admin.password);

        if (!passwordMatch) {
            return res.render('admin-login', {
                message: 'Invalid admin credentials.',
                error: null,
                errors: {}
            });
        }

        const userId = req.session.userId;

        req.session.regenerate((err) => {
            if (err) {
                console.error('Session regeneration error:', err);
                return res.status(500).render('admin-login', {
                    message: 'Login failed. Please try again.',
                    error: null,
                    errors: {}
                });
            }

            if (userId) {
                req.session.userId = userId;
            }

            req.session.admin = admin._id;

            req.session.save((saveErr) => {
                if (saveErr) {
                    console.error('Session save error:', saveErr);
                    return res.status(500).render('admin-login', {
                        message: 'Login failed. Please try again.',
                        error: null,
                        errors: {}
                    });
                }
                return res.redirect('/admin');
            });
        });

    } catch (err) {
        console.error('Admin login error:', err);
        return res.render('admin-login', {
            message: 'Server error. Please try again.',
            error: null,
            errors: {}
        });
    }
};

const loadDashboard = async (req, res) => {
    try {
        if (!req.session || !req.session.admin) {
            return res.redirect('/admin/login');
        }

        const admin = await User.findById(req.session.admin);

        res.render('admin-dashboard', {
            adminName: admin ? admin.name : 'Admin'
        });
    } catch (error) {
        console.error('Dashboard load error:', error);
        res.redirect('/admin/login');
    }
};

const logout = async (req, res) => {
    try {
        const userId = req.session.userId;

        delete req.session.admin;

        if (userId) {
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    res.clearCookie('kaizen.sid');
                    return res.redirect('/admin/login');
                }
                return res.redirect('/admin/login');
            });
        } else {
            req.session.destroy((err) => {
                if (err) {
                    console.error('Session destruction error:', err);
                }
                res.clearCookie('kaizen.sid');
                return res.redirect('/admin/login');
            });
        }
    } catch (error) {
        console.error('Admin logout error:', error);
        res.clearCookie('kaizen.sid');
        res.redirect('/admin/login');
    }
};

module.exports = {
    loadLogin,
    login,
    loadDashboard,
    pageError,
    logout
};