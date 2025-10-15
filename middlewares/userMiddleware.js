const User = require('../models/userSchema');

const loadUserData = async (req, res, next) => {
    try {
        const sessionUserId = req.session.userId;
        let userData = null;

        if (sessionUserId) {
            userData = await User.findById(sessionUserId);

            if (userData && userData.isBlocked) {
                req.session.destroy((err) => {
                    if (err) {
                        console.error('Error destroying session for blocked user:', err);
                    }
                });
                res.locals.user = null;
                return next();
            }
        }

        res.locals.user = userData;
        next();
    } catch (error) {
        console.log('User middleware error:', error);
        res.locals.user = null;
        next();
    }
};

module.exports = loadUserData;