const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userSchema');
require('dotenv').config();

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback'
},
    async (accessToken, refreshToken, profile, done) => {
        try {
            let user = await User.findOne({ googleId: profile.id });

            if (!user) {
                const email = profile.emails[0].value;
                user = await User.findOne({ email, isAdmin: false });

                if (user) {
                    user.googleId = profile.id;
                    await user.save();
                }
            }

            if (!user) {
                user = new User({
                    name: profile.displayName,
                    email: profile.emails[0].value,
                    googleId: profile.id,
                    isBlocked: false,
                    isAdmin: false
                });

                await user.save();
            }

            if (user.isBlocked) {
                return done(null, false, { message: 'Your account has been blocked.' });
            }

            return done(null, user);

        } catch (err) {
            console.error('Google Auth Error:', err);
            return done(err, null);
        }
    }
));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        console.error('Deserialize error:', error);
        done(error, null);
    }
});

module.exports = passport;