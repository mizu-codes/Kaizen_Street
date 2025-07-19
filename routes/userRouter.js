const express = require('express');
const router = express.Router();
const passport = require('passport');
const upload = require('../middlewares/multer');
const profileController = require('../controllers/user/profileController')
const { userAuth } = require('../middlewares/auth');

const errorController = require('../controllers/user/errorController');
const authController = require('../controllers/user/authController');
const passwordController = require('../controllers/user/passwordController');
const userPageController = require('../controllers/user/userPageController');

router.get('/pageNotFound', errorController.pageNotFound);

router.get('/', userPageController.loadHomepage);
router.get('/shop', userPageController.loadShoppingPage);
router.get('/products/:productId', userPageController.loadProductDetails);
router.get('/shop/product/:productId', userPageController.loadProductDetails);

router.get('/signup', authController.loadSignup);
router.post('/signup', authController.signup);
router.post('/verify-otp', authController.verifyOtp);
router.post('/resend-otp', authController.resendOtp);

router.get('/login', authController.loadLogin);
router.post('/login', authController.login);
router.get('/logout', authController.logout);

router.get('/forgot-password', passwordController.loadForgotPassword);
router.post('/forgot-password', passwordController.sendPasswordOtp);
router.get('/forgot-password/otp', passwordController.loadForgotPasswordOtp);
router.post('/forgot-password/otp', passwordController.verifyPasswordOtp);
router.post('/forgot-password/resend', passwordController.resendForgotPasswordOtp);
router.get('/reset-password', passwordController.loadResetPassword);
router.post('/reset-password', passwordController.resetPassword);

router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/signup' }), (req, res) => {
    req.session.userId = req.user._id;
    return res.redirect('/')
});


router.get('/userProfile', userAuth, profileController.userProfile);
router.get('/profile/edit', userAuth, profileController.updateProfile);
router.post('/profile/update', userAuth, upload.single('avatar'), profileController.saveProfile);
router.post('/profile/verify-otp', userAuth, profileController.verifyProfileOtp);

module.exports = router;

