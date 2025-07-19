const User=require('../../models/userSchema');
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
        return res.render('login')
    }
    catch (error) {
        console.log('Login page not loading', error);
        return res.status(500).send('Server error')
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

        req.session.userId = user._id;
        return res.redirect('/');
    } catch (err) {
        console.error('login error:', err);
        return res.status(500).render('login', {
            message: 'Login failed. Please try again later.',
            showLoginError: true
        });
    }
};



const signup = async (req, res) => {
    try {
        const { name, email, password, confirmPassword, phone } = req.body

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

        const otp = generateOtp()

        const emailSent = await sendVerificationEmail(email, otp);

        if (!emailSent) {
            return res.json('email-error')
        }

        req.session.userOtp = otp;
        req.session.userData = { name, email, password, phone }

        res.render('verify-otp');
        console.log('OTP sent', otp)

    } catch (error) {
        console.log('signup error', error);
        res.redirect('/pageNotFound');
    }
}

const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;

        console.log("Entered OTP:", otp);

        if (otp === req.session.userOtp) {
            const user = req.session.userData;

            const existingUser = await User.findOne({ email: user.email });
            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: 'Email already registered. Please login instead.'
                });
            }

            const passwordHash = await securePassword(user.password)

            const saveUserData = new User({
                name: user.name,
                email: user.email,
                password: passwordHash,
                phone: user.phone
            })

            await saveUserData.save();

            req.session.userId = saveUserData._id;
            req.session.userOtp = null;
            req.session.userData = null;

            res.json({ success: true, redirectUrl: '/' })
        } else {
            res.status(400).json({ success: false, message: 'Invalid OTP,Please try again' });
        }

    } catch (error) {
        console.error('Error Verifying OTP', error);
        return res.status(500).json({ success: false, message: 'An error occured' })
    }
}

const resendOtp = async (req, res) => {
    try {
        const { email } = req.session.userData;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email not found in this session' })
        }

        const otp = generateOtp();
        req.session.userOtp = otp

        console.log('Sending email to:', email);

        const emailSent = await sendVerificationEmail(email, otp);
        if (emailSent) {
            console.log('Resend OTP:', otp);
            res.status(200).json({ success: true, message: 'OTP Resend Successfully' });
        } else {
            res.status(500).json({ success: false, message: 'Failed to resend OTP.Please try again' });
        }

    } catch (error) {
        console.error('Error resending OTP', error);
        res.status(500).json({ success: false, message: 'Internal Server Error.Please try again' })
    }
}

const logout = async (req, res) => {
    try {
        req.session.destroy((err) => {
            if (err) {
                console.log('Session destruction error', error.message);
                return res.redirect('/pageNotFound');
            }
            return res.redirect('login')
        })
    } catch (error) {
        console.log('logout error', error);
        res.redirect('/pageNotFound')
    }
}

module.exports={
    loadSignup,
    signup,
    verifyOtp,
    resendOtp,
    loadLogin,
    login,
    logout,
}