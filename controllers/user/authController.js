
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
        console.log('Signup page not loading', error);
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
        console.log('Login page not loading', error);
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

        console.log('Sending OTP to email:', email);

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
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: 'Verify your account',
            text: `Your OTP is ${otp}`,
            html: `<b>Your OTP: ${otp}</b>`
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
            console.log('OTP sent', otp);
        });

    } catch (error) {
        console.log('signup error', error);
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
            console.log('Wallet already exists for user');
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

        console.log(`Referral credit processed: ₹${creditAmount} added to wallet for user ${newUserId}`);
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

        console.log("Entered OTP:", otp);

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
                        console.log(`Referral successful: ${userData.email} referred by ${referrer.email}`);
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
                    console.log('Session destruction error', err.message);
                    return res.redirect('/pageNotFound');
                }
                res.clearCookie('kaizen.sid');
                return res.redirect('/');
            });
        }
    } catch (error) {
        console.log('logout error', error);
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