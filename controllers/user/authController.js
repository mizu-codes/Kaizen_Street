
const mongoose = require('mongoose');
const User = require('../../models/userSchema');
const Wallet = require('../../models/walletSchema');
const WalletTransaction = require('../../models/walletTransactionSchema');
const { securePassword } = require('../../utils/passwordUtils');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');

const loadSignup = async (req, res) => {
    try {
        return res.render('signup')
    }
    catch (error) {
        res.status(500).send('Server error')
    }
}

const loadLogin = (req, res) => {
    try {
        let message = null;
        let showLoginError = false;

        if (req.query.error === 'blocked' && req.query.message) {
            message = decodeURIComponent(req.query.message);
            showLoginError = true;
        } else if (req.query.error === 'auth_failed') {
            message = 'Google authentication failed. Please try again.';
            showLoginError = true;
        } else if (req.query.error === 'login_failed') {
            message = 'Login failed. Please try again.';
            showLoginError = true;
        } else if (req.query.error === 'session_error') {
            message = 'Session error occurred. Please try again.';
            showLoginError = true;
        }

        return res.render('login', {
            message: message,
            showLoginError: showLoginError
        });
    }
    catch (error) {
        return res.status(500).send('Server error');
    }
}

function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, otp) {
    try {
        if (!email || email.trim() === '') {
            console.error('Cannot send email: recipient email is missing or invalid.');
            return false;
        }

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        });

        const info = await transporter.sendMail({
            from: `"Kaizen Street" <${process.env.NODEMAILER_EMAIL}>`,
            to: email,
            subject: 'Verify your email - Welcome to Kaizen Street',
            html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Poppins', Arial, sans-serif;">
    <!-- Preheader - hidden from view -->
    <span style="color:#ffffff;display:none;height:0;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;visibility:hidden;width:0;">Verify your email with OTP &#847; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp;</span>

    <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);">
                    
                    <!-- Header with anime-inspired design -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #007b5e 0%, #005a47 50%, #003d31 100%); padding: 0; position: relative; border-radius: 20px 20px 0 0;">
                            <div style="padding: 40px 30px; text-align: center; position: relative;">
                                <!-- Logo Container with your brand design -->
                                <div style="background: rgba(0, 0, 0, 1); width: 115px; height: 115px; border-radius: 50%; margin: 0 auto 20px; display: inline-flex; align-items: center; justify-content: center; backdrop-filter: blur(10px); border: 3px solid rgba(255,255,255,0.3); position: relative; overflow: hidden; font-size: 0; mso-hide: all;">
                                    <!-- Red banner with Japanese characters -->
                                    <div style="position: absolute; left: 0; top: 0; bottom: 0; width: 35%; background: #ca1616ff; display: flex; align-items: center; justify-content: center; font-size: 0; mso-hide: all;">
                                        <div style="color: white; font-size: 28px; font-weight: 700; writing-mode: vertical-rl; letter-spacing: 2px;">改善</div>
                                    </div>
                                    <!-- Text part -->
                                    <div style="margin-left: 10px; margin-top: 29px; color: white; font-weight: 700; font-size: 25px; line-height: 1.2;">
                                        Kai<br>Zen
                                    </div>
                                </div>
                                <h1 style="margin: 0; font-size: 32px; color: #ffffff; font-weight: 700; letter-spacing: 2px; text-shadow: 2px 2px 4px rgba(0,0,0,0.2);">
                                    KAIZEN STREET
                                </h1>
                                <p style="margin: 8px 0 0; font-size: 14px; color: rgba(255,255,255,0.9); font-weight: 500; letter-spacing: 3px; text-transform: uppercase;">
                                    Anime Clothing
                                </p>
                            </div>
                            <!-- Decorative wave -->
                            <svg style="display: block; width: 100%; height: 30px;" viewBox="0 0 1200 120" preserveAspectRatio="none">
                                <path d="M0,0 C200,60 400,60 600,30 C800,0 1000,0 1200,30 L1200,120 L0,120 Z" fill="#ffffff"></path>
                            </svg>
                        </td>
                    </tr>

                    <!-- Main Content -->
                    <tr>
                        <td style="padding: 40px 50px; background: #000000;">
                            <h2 style="margin: 0 0 20px; font-size: 26px; color: #ffffff; font-weight: 600;">
                                Email Verification 
                            </h2>
                            
                            <p style="margin: 0 0 25px; line-height: 1.8; color: #cccccc; font-size: 16px;">
                                Hey there! 👋<br><br>
                                Welcome to Kaizen Street! To complete your signup, please verify your email using the one-time password below.
                            </p>

                            <!-- OTP Box with enhanced styling -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                                <tr>
                                    <td align="center">
                                        <div style="background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%); border: 3px dashed #ffff; border-radius: 16px; padding: 30px; display: inline-block; box-shadow: 0 8px 25px rgba(255,77,77,0.15);">
                                            <p style="margin: 0 0 12px; font-size: 14px; color: #718096; font-weight: 500; letter-spacing: 1px; text-transform: uppercase;">
                                                Your OTP Code
                                            </p>
                                            <div style="font-size: 42px; font-weight: 700; letter-spacing: 12px; color: #ff4d4d; text-shadow: 2px 2px 4px rgba(255,77,77,0.1); font-family: 'Courier New', monospace;">
                                                ${otp}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            </table>

                            <!-- Warning box -->
                            <div style="background: linear-gradient(135deg, #fff5f5 0%, #fed7d7 100%); border-left: 4px solid #ff4d4d; padding: 20px; border-radius: 8px; margin: 25px 0;">
                                <p style="margin: 0; color: #c53030; font-size: 14px; line-height: 1.6;">
                                    ⚠️ <strong>Important:</strong> This OTP will expire in <strong>5 minutes</strong>. Never share this code with anyone, including Kaizen Street.
                                </p>
                            </div>

                            <!-- CTA Button -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin: 35px 0 20px;">
                                <tr>
                                    <td align="center">
                                        <a href="https://kaizenstreet.store" style="display: inline-block; background: #007b5e; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 50px; font-weight: 600; font-size: 16px; transition: all 0.3s ease;">
                                            Visit Kaizen Street →
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #007b5e 0%, #005a47 50%, #003d31 100%); padding: 30px; text-align: center; border-radius: 0 0 20px 20px;">
                            <p style="margin: 0 0 15px; color: #e2e8f0; font-size: 13px; line-height: 1.6;">
                                If you didn't request this email, you can safely ignore it.<br>
                                Your account will remain secure.
                            </p>
                            <div style="border-top: 1px solid rgba(255,255,255,0.1); margin: 20px 0; padding-top: 20px;">
                                <p style="margin: 0 0 8px; color: #ffffff; font-size: 12px; font-weight: 500;">
                                    © ${new Date().getFullYear()} Kaizen Street. All rights reserved.
                                </p>
                                <p style="margin: 0; color: #e2e8f0; font-size: 11px;">
                                    Anime clothing for the culture
                                </p>
                            </div>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`
        });

        return info.accepted.length > 0;

    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
}

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.render('login', {
                message: 'Please enter both email and password.',
                showLoginError: true
            });
        }

        const user = await User.findOne({ isAdmin: 0, email });
        if (!user) {
            return res.render('login', {
                message: 'No account found with that email.',
                showLoginError: true
            });
        }

        if (user.isBlocked) {
            return res.render('login', {
                message: 'User is blocked by admin.',
                showLoginError: true
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.render('login', {
                message: 'Incorrect password.',
                showLoginError: true
            });
        }

        const adminId = req.session.admin;

        req.session.regenerate((err) => {
            if (err) {
                console.error('Session regeneration error:', err);
                return res.status(500).render('login', {
                    message: 'Login failed. Please try again later.',
                    showLoginError: true
                });
            }

            if (adminId) {
                req.session.admin = adminId;
            }

            req.session.userId = user._id;

            req.session.save((saveErr) => {
                if (saveErr) {
                    console.error('Session save error:', saveErr);
                    return res.status(500).render('login', {
                        message: 'Login failed. Please try again later.',
                        showLoginError: true
                    });
                }

                return res.redirect('/');
            });
        });

    } catch (err) {
        console.error('login error:', err);
        return res.status(500).render('login', {
            message: 'Login failed. Please try again later.',
            showLoginError: true
        });
    }
};

const validateReferralCode = async (req, res) => {
    try {
        const { referralCode } = req.body;

        if (!referralCode || referralCode.trim() === '') {
            return res.json({ valid: false, message: 'Referral code is required.' });
        }

        const referrer = await User.findOne({ referalCode: referralCode.trim().toUpperCase() });

        if (!referrer) {
            return res.json({ valid: false, message: 'Invalid referral code.' });
        }

        return res.json({ valid: true, message: 'Valid referral code!' });

    } catch (error) {
        console.error('Error validating referral code:', error);
        return res.json({ valid: false, message: 'Error validating referral code.' });
    }
};


const signup = async (req, res) => {
    try {
        const { name, email, password, confirmPassword, phone, referralCode } = req.body

        if (password !== confirmPassword) {
            return res.render('signup', { message: 'Passwords do not match' });
        }

        const findUser = await User.findOne({ email });
        if (findUser) {
            return res.render('signup', {
                message: 'User with this email already exists',
                showUserExistsPopup: true
            });
        }

        let referrer = null;
        if (referralCode && referralCode.trim() !== '') {
            referrer = await User.findOne({ referalCode: referralCode.trim().toUpperCase() });
            if (!referrer) {
                return res.render('signup', {
                    message: 'Invalid referral code provided.'
                });
            }
        }

        const otp = generateOtp()

        const emailSent = await sendVerificationEmail(email, otp);

        if (!emailSent) {
            return res.json('email-error')
        }

        req.session.userOtp = otp;
        req.session.userData = { name, email, password, phone, referralCode: referralCode?.trim().toUpperCase() || null }

        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.status(500).send('Session error');
            }
            res.render('verify-otp');
        });

    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

const createWalletWithReferralCredit = async (newUserId, referrerUserId) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const creditAmount = 100;

        const existingWallet = await Wallet.findOne({ userId: newUserId }).session(session);
        if (existingWallet) {
            await session.abortTransaction();
            session.endSession();
            return existingWallet;
        }

        const newWallet = new Wallet({
            userId: newUserId,
            balance: creditAmount,
            totalCredits: creditAmount,
            totalDebits: 0,
            transactionCount: 1,
            isActive: true,
            isBlocked: false,
            lastTransactionAt: new Date(),
            lastCreditAt: new Date()
        });

        const savedWallet = await newWallet.save({ session });

        const walletTransaction = new WalletTransaction({
            wallet: savedWallet._id,
            user: newUserId,
            type: 'credit',
            amount: creditAmount,
            description: 'Referral bonus - Welcome credit for joining with referral code',
            status: 'completed',
            balanceBefore: 0,
            balanceAfter: creditAmount,
            paymentDetails: {
                method: null,
                gatewayTransactionId: null,
                gatewayOrderId: null,
                gatewayPaymentId: null
            },
            processedAt: new Date(),
            completedAt: new Date()
        });

        await walletTransaction.save({ session });

        await User.findByIdAndUpdate(referrerUserId, {
            $inc: { totalReferrals: 1 }
        }, { session });

        await User.findByIdAndUpdate(newUserId, {
            referralRewardReceived: true
        }, { session });

        await session.commitTransaction();
        session.endSession();

        return savedWallet;

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Error creating wallet with referral credit:', error);
        throw error;
    }
};

const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;

        if (otp === req.session.userOtp) {
            const userData = req.session.userData;

            const existingUser = await User.findOne({ email: userData.email });
            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: 'Email already registered. Please login instead.'
                });
            }

            const passwordHash = await securePassword(userData.password);

            let referrer = null;
            if (userData.referralCode) {
                referrer = await User.findOne({ referalCode: userData.referralCode });

                if (!referrer) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid referral code provided.'
                    });
                }
            }

            const saveUserData = new User({
                name: userData.name,
                email: userData.email,
                password: passwordHash,
                phone: userData.phone,
                referredBy: referrer ? referrer._id : null
            });

            const savedUser = await saveUserData.save();

            if (referrer) {
                try {
                    if (referrer._id.toString() === savedUser._id.toString()) {
                        console.log('Self-referral attempt blocked');
                    } else {
                        await createWalletWithReferralCredit(savedUser._id, referrer._id);
                    }
                } catch (walletError) {
                    console.error('Error processing referral wallet credit:', walletError);
                }
            }

            const adminId = req.session.admin;

            req.session.regenerate((err) => {
                if (err) {
                    console.error('Session regeneration error:', err);
                    return res.status(500).json({
                        success: false,
                        message: 'Session error occurred'
                    });
                }

                if (adminId) {
                    req.session.admin = adminId;
                }

                req.session.userId = savedUser._id;

                const message = referrer ?
                    'Account created successfully! ₹100 referral credit has been added to your wallet.' :
                    'Account created successfully!';

                req.session.save((saveErr) => {
                    if (saveErr) {
                        console.error('Session save error:', saveErr);
                        return res.status(500).json({
                            success: false,
                            message: 'Session error occurred'
                        });
                    }
                    res.json({
                        success: true,
                        redirectUrl: '/',
                        message: message
                    });
                });
            });

        } else {
            res.status(400).json({ success: false, message: 'Invalid OTP, Please try again' });
        }

    } catch (error) {
        console.error('Error Verifying OTP', error);
        return res.status(500).json({ success: false, message: 'An error occurred' })
    }
};

const resendOtp = async (req, res) => {
    try {
        const { email } = req.session.userData;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email not found in this session' })
        }

        const otp = generateOtp();
        req.session.userOtp = otp

        const emailSent = await sendVerificationEmail(email, otp);

        if (emailSent) {
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    return res.status(500).json({
                        success: false,
                        message: 'Session error occurred'
                    });
                }
                res.status(200).json({ success: true, message: 'OTP Resend Successfully' });
            });
        } else {
            res.status(500).json({ success: false, message: 'Failed to resend OTP. Please try again' });
        }

    } catch (error) {
        console.error('Error resending OTP', error);
        res.status(500).json({ success: false, message: 'Internal Server Error. Please try again' })
    }
}

const logout = async (req, res) => {
    try {
        const adminId = req.session.admin;

        delete req.session.userId;

        if (adminId) {
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    res.clearCookie('kaizen.sid');
                    return res.redirect('/');
                }
                return res.redirect('/');
            });
        } else {
            req.session.destroy((err) => {
                if (err) {
                    return res.redirect('/pageNotFound');
                }
                res.clearCookie('kaizen.sid');
                return res.redirect('/');
            });
        }
    } catch (error) {
        res.redirect('/pageNotFound');
    }
};

module.exports = {
    loadSignup,
    signup,
    verifyOtp,
    resendOtp,
    loadLogin,
    login,
    logout,
    validateReferralCode
}