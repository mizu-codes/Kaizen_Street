const express = require('express');
const router = express.Router();
const passport = require('passport');

router.get('/auth/google', (req, res, next) => {
    if (req.session.admin) {
        res.cookie('temp_admin', req.session.admin, {
            maxAge: 5 * 60 * 1000,
            httpOnly: true,
            signed: true
        });
    }
    passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

router.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/signup' }),
    (req, res) => {
        const adminId = req.signedCookies.temp_admin;

        res.clearCookie('temp_admin');

        req.session.regenerate((err) => {
            if (err) {
                console.error('Session regeneration error:', err);
                return res.redirect('/signup');
            }

            if (adminId) {
                req.session.admin = adminId;
            }

            req.session.userId = req.user._id;

            req.session.save((saveErr) => {
                if (saveErr) {
                    console.error('Session save error:', saveErr);
                    return res.redirect('/signup');
                }
                return res.redirect('/');
            });
        });
    }
);

module.exports = router;