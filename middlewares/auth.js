const User = require('../models/userSchema');

const userAuth = async (req, res, next) => {
    try {
        const id = req.session.userId;

        if (!id) {
            if (req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type']?.includes('application/json')) {
                return res.status(401).json({
                    success: false,
                    message: 'Please login first.',
                    redirect: '/login'
                });
            }
            return res.redirect('/login');
        }

        const userDoc = await User.findById(id);

        if (!userDoc) {
            return req.session.destroy((err) => {
                if (err) {
                    console.error('Session destruction error:', err);
                }

                if (req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type']?.includes('application/json')) {
                    return res.status(401).json({
                        success: false,
                        message: 'User not found. Please login again.',
                        redirect: '/login'
                    });
                }
                return res.redirect('/login');
            });
        }

        if (userDoc.isBlocked) {
            return req.session.destroy((err) => {
                if (err) {
                    console.error('Session destruction error:', err);
                }

                if (req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type']?.includes('application/json')) {
                    return res.status(403).json({
                        success: false,
                        message: 'Your account has been blocked. Please contact support.',
                        redirect: '/login'
                    });
                }
                return res.redirect('/login');
            });
        }

        next();

    } catch (err) {
        console.error('Error in userAuth middleware:', err);

        if (req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type']?.includes('application/json')) {
            return res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
        res.status(500).send('Internal Server Error');
    }
};

const adminAuth = async (req, res, next) => {
    try {

        if (!req.session || !req.session.admin) {
            return res.redirect('/admin/login');
        }

        const adminUser = await User.findOne({
            _id: req.session.admin,
            isAdmin: true
        });

        if (!adminUser) {
            req.session.destroy((err) => {
                if (err) {
                    console.error('Session destruction error:', err);
                }
            });
            return res.redirect('/admin/login');
        }
        next();

    } catch (error) {
        console.error('Error in adminAuth middleware:', error);
        res.status(500).send('Internal Server Error');
    }
};

module.exports = {
    userAuth,
    adminAuth
};