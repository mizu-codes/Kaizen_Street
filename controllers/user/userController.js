const User = require('../../models/userSchema');
const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const env = require('dotenv').config()
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt')

const pageNotFound = (req, res) => {
    try {
        return res.status(404).render('page-404');
    } catch (error) {
        console.error('Error rendering 404 page:', error);
        return res.status(500).send('Server error');
    }
};

const loadHomepage = async (req, res) => {
    try {
        const categories = await Category.find({ isListed: true });
        let productData = await Product.find({
            isBlocked: false,
            category: { $in: categories.map(category => category._id) },
            stock: { $gt: 0 }
        }).populate({
            path: 'category',
            select: 'categoryName',
            match: { isListed: true }
        }).lean();

        productData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        productData = productData.slice(0, 4);

        return res.render('home', { products: productData, categories });
    } catch (error) {
        console.log('Home page load error:', error);
        return res.status(500).send('Server error');
    }
};


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
        const { name, email, password, confirmPassword } = req.body

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
        req.session.userData = { name, email, password }

        res.render('verify-otp');
        console.log('OTP sent', otp)

    } catch (error) {
        console.log('signup error', error);
        res.redirect('/pageNotFound');
    }
}

const securePassword = async (password) => {
    try {
        const passwordHash = await bcrypt.hash(password, 10)

        return passwordHash
    } catch (error) {

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
            })

            await saveUserData.save();

            req.session.user = saveUserData._id;
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

        console.log(`OTP for ${email}: ${otp}`);

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

        console.log(`Resent OTP for ${email}: ${otp}`);

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

        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword;
        await user.save();

        return res.status(200).json({ success: true, message: 'Password updated successfully.' });
    } catch (err) {
        console.error('resetPassword error:', err);
        return res.status(500).json({ success: false, message: 'Something went wrong. Try again.' });
    }
};

const loadShoppingPage = async (req, res) => {
    try {

        const perPage = 6;
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const search = (req.query.search || '').trim();
        const category = req.query.category || '';
        const sortOption = req.query.sort || 'featured';

        const minPrice = parseFloat(req.query.minPrice) || 0;
        const maxPrice = parseFloat(req.query.maxPrice) || 5000;

        const filter = { isBlocked: false, stock: { $gt: 0 } };
        if (search.length) { filter.productName = { $regex: search, $options: 'i' }; }
        if (category) filter.category = category;

        filter.discountPrice = { $gte: minPrice, $lte: maxPrice };

        let sortCriteria = { createdAt: -1 };
        if (sortOption === 'low-to-high') {
            sortCriteria = { discountPrice: 1 };
        } else if (sortOption === 'high-to-low') {
            sortCriteria = { discountPrice: -1 };
        } else if (sortOption === 'a-to-z') {
            sortCriteria = { productName: 1 };
        } else if (sortOption === 'z-to-a') {
            sortCriteria = { productName: -1 };
        }

        const priceRange = await Product.aggregate([
            { $match: { isBlocked: false, stock: { $gt: 0 } } },
            {
                $group: {
                    _id: null,
                    minPrice: { $min: "$discountPrice" },
                    maxPrice: { $max: "$discountPrice" }
                }
            }
        ]);

        const actualMinPrice = priceRange.length > 0 ? Math.floor(priceRange[0].minPrice) : 0;
        const actualMaxPrice = priceRange.length > 0 ? Math.min(Math.ceil(priceRange[0].maxPrice), 5000) : 5000;

        const [categories, count, products] = await Promise.all([
            Category.find({ isListed: true }).lean(),
            Product.countDocuments(filter),
            Product.find(filter)
                .populate('category', 'categoryName')
                .sort(sortCriteria)
                .skip(perPage * (page - 1))
                .limit(perPage)
                .lean()
        ]);

        const pages = Math.ceil(count / perPage);

        res.render('shop', {
            categories,
            products,
            search,
            category,
            sort: sortOption,
            page,
            pages,
            count,
            minPrice: req.query.minPrice || 0,
            maxPrice: req.query.maxPrice || 5000,
            actualMinPrice: 0,
            actualMaxPrice: 5000,
            currentFilters: {
                search: search,
                category: category,
                sort: sortOption,
                minPrice: req.query.minPrice || '',
                maxPrice: req.query.maxPrice || ''
            }
        });
    } catch (error) {
        console.error('Shope page error:', error);
        res.redirect('/pageNotFound');
    }
};


const loadProductDetails = async (req, res) => {
    try {
        const productId = req.params.productId;

        const productDoc = await Product.findById(productId).populate('category');
        if (!productDoc || productDoc.isBlocked) {
            return res.status(404).render('page-404', { message: 'Product not found' });
        }

        const regularPrice = productDoc.regularPrice;
        const discountPrice = productDoc.discountPrice;
        const discountPercentage = regularPrice > discountPrice
            ? Math.round((1 - discountPrice / regularPrice) * 100)
            : 0;

        const relatedDocs = await Product.find({
            category: productDoc.category._id,
            _id: { $ne: productDoc._id },
            isBlocked: false,
            status: 'active',
            stock: { $gt: 0 }
        }).sort({ createdAt: -1 }).lean();


        const relatedProducts = relatedDocs.map(p => {
            const discountPercent = p.regularPrice > p.discountPrice
                ? Math.round((1 - p.discountPrice / p.regularPrice) * 100)
                : 0;
            return {
                _id: p._id,
                productName: p.productName,
                productImage: p.productImage.slice(0, 2),
                regularPrice: p.regularPrice,
                discountPrice: p.discountPrice,
                discountPercentage: discountPercent
            };
        });

        const product = {
            _id: productDoc._id,
            productName: productDoc.productName,
            category: productDoc.category._id,
            categoryName: productDoc.category.categoryName,
            regularPrice,
            discountPrice,
            discountPercentage,
            description: productDoc.description,
            specifications: productDoc.specifications || '',
            size: productDoc.size,
            productImage: productDoc.productImage.slice(0, 5)
        };

        return res.render('product-details', {
            product,
            relatedProducts,
            pageTitle: product.productName,
            selectedSize: product.size
        });

    } catch (err) {
        console.error('Error loading product details:', err);
        return res.status(500).render('500', { message: 'Internal Server Error' });
    }
};


module.exports = {
    pageNotFound,

    loadHomepage,
    loadShoppingPage,

    loadSignup,
    signup,
    verifyOtp,
    resendOtp,
    loadLogin,
    login,
    logout,

    loadForgotPassword,
    sendPasswordOtp,
    loadForgotPasswordOtp,
    verifyPasswordOtp,
    resendForgotPasswordOtp,
    loadResetPassword,
    resetPassword,

    loadProductDetails,
}


