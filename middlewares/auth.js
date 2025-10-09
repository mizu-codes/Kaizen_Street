const User = require('../models/userSchema')

const userAuth = async (req, res, next) => {
    try {
        const id = req.session.userId;
        if (!id) {
            if (req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type']?.includes('application/json')) {
                return res.status(401).json({ 
                    message: 'Please login first.',
                    redirect: '/login' 
                });
            }
            return res.redirect('/login');
        }

        const userDoc = await User.findById(id);
        if (!userDoc || userDoc.isBlocked) {
            req.session.userId = null;
          
            if (req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type']?.includes('application/json')) {
                return res.status(401).json({ 
                    message: 'Please login to continue.',
                    redirect: '/login' 
                });
            }
            return res.redirect('/login');
        }
        
        next();
    } catch (err) {
        console.error('Error in userAuth middleware:', err);
        res.status(500).send('Internal Server Error');
    }
};

const adminAuth = async (req, res, next) => {
    try {
        if (req.session && req.session.admin) {
            const adminUser = await User.findOne({
                _id: req.session.admin,
                isAdmin: true
            });

            if (adminUser) {
                next();
            } else {
                req.session.admin = null;
                res.redirect('/admin/login');
            }
        } else {
            res.redirect('/admin/login');
        }
    } catch (error) {
        console.log('Error in adminAuth middleware:', error);
        res.status(500).send('Internal Server Error');
    }
};


module.exports = {
    userAuth,
    adminAuth
}