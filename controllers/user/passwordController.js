const User = require('../../models/userSchema');
const bcrypt = require('bcrypt');
const { securePassword } = require('../../utils/passwordUtils');
const { sendVerificationEmail } = require('../../utils/emailUtils');
const nodemailer = require('nodemailer');

const loadForgotPassword = (req, res) => {
    return res.render('forgot-password')
}

const sendPasswordOtp = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.render('forgot-password', { error: 'Please enter your email.' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.render('forgot-password', {
                message: 'If that email exists, you’ll receive an OTP shortly.'
            });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        req.session.passwordReset = { email, otp };

        const emailSent = await sendVerificationEmail(email, otp);
        if (!emailSent) {
            return res.render('forgot-password', {
                error: 'Unable to send OTP right now. Please try again later.'
            });
        }

        return res.render('forgot-password-otp', {
            email,
            message: 'OTP sent! Please check your email.'
        });
    } catch (err) {
        console.error('Error in sendPasswordOtp:', err);
        return res.status(500).render('forgot-password', {
            error: 'There was an error. Please try again later.'
        });
    }
};

const loadForgotPasswordOtp = (req, res) => {
    const sessionData = req.session.passwordReset;
    if (!sessionData || !sessionData.email) {

        return res.redirect('/forgot-password');
    }

    return res.render('forgot-password-otp', {
        email: sessionData.email,
        message: 'Enter the code we just emailed you.'
    });
};

const verifyPasswordOtp = (req, res) => {
    const { email, otp } = req.body;
    const stored = req.session.passwordReset;

    if (!stored || stored.email !== email) {
        return res.status(400).json({
            success: false,
            message: 'Session expired. Please start over.'
        });
    }

    if (stored.otp !== otp) {
        return res.status(400).json({
            success: false,
            message: 'Please check and try again.'
        });
    }

    delete req.session.passwordReset;

    return res.status(200).json({
        success: true,
        message: 'OTP verified successfully',
        redirectUrl: `/reset-password?email=${encodeURIComponent(email)}`
    });
};

const resendForgotPasswordOtp = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email required' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(200).json({
                success: true,
                message: 'If that email exists, OTP has been resent.'
            });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        req.session.passwordReset = { email, otp };

        const emailSent = await sendVerificationEmail(email, otp);
        if (!emailSent) {
            return res.status(500).json({
                success: false,
                message: 'Failed to send OTP. Try again later.'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'OTP resent successfully.'
        });

    } catch (err) {
        console.error('Error in resendForgotPasswordOtp:', err);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const loadResetPassword = (req, res) => {
    const { email } = req.query;

    if (!email) {
        return res.redirect('/forgot-password');
    }

    return res.render('reset-password', { email, error: null });
};

const resetPassword = async (req, res) => {
    try {
        const { email, password, confirmPassword } = req.body;

        if (!email || !password || !confirmPassword) {
            return res.status(400).json({ success: false, message: 'All fields are required.' });
        }
        if (password !== confirmPassword) {
            return res.status(400).json({ success: false, message: 'Passwords do not match.' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        
        user.password = await securePassword(password);
        await user.save();

        return res.status(200).json({ success: true, message: 'Password updated successfully.' });
    } catch (err) {
        console.error('resetPassword error:', err);
        return res.status(500).json({ success: false, message: 'Something went wrong. Try again.' });
    }
};

module.exports = {
    loadForgotPassword,
    sendPasswordOtp,
    loadForgotPasswordOtp,
    verifyPasswordOtp,
    resendForgotPasswordOtp,
    loadResetPassword,
    resetPassword,
}