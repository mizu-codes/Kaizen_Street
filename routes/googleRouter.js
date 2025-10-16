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
    (req, res, next) => {
        passport.authenticate('google', (err, user, info) => {
            if (err) {
                console.error('Google auth error:', err);
                return res.redirect('/login?error=auth_failed');
            }

            if (!user) {
                const message = info?.message || 'Authentication failed';
                return res.redirect(`/login?error=blocked&message=${encodeURIComponent(message)}`);
            }

            req.logIn(user, (loginErr) => {
                if (loginErr) {
                    console.error('Login error:', loginErr);
                    return res.redirect('/login?error=login_failed');
                }

                const adminId = req.signedCookies.temp_admin;
                res.clearCookie('temp_admin');

                req.session.regenerate((sessionErr) => {
                    if (sessionErr) {
                        console.error('Session regeneration error:', sessionErr);
                        return res.redirect('/login?error=session_error');
                    }

                    if (adminId) {
                        req.session.admin = adminId;
                    }

                    req.session.userId = user._id;

                    req.session.save((saveErr) => {
                        if (saveErr) {
                            console.error('Session save error:', saveErr);
                            return res.redirect('/login?error=session_error');
                        }
                        return res.redirect('/');
                    });
                });
            });
        })(req, res, next);
    }
);

module.exports = router;