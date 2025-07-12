const User = require('../models/userSchema');

const loadUserData = async (req, res, next) => {
    try {
        const sessionUserId = req.session.userId || req.session.user;
        let userData = null;
        
        if (sessionUserId) {
            userData = await User.findById(sessionUserId);
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