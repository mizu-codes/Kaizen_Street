const express = require('express');
const router = express.Router();
const passport = require('passport');
const userController = require('../controllers/user/userController');
const profileController= require('../controllers/user/profileController')
const { userAuth } = require('../middlewares/auth');

router.get('/pageNotFound', userController.pageNotFound);

router.get('/', userController.loadHomepage);
router.get('/shop',userController.loadShoppingPage);
router.get('/products/:productId',userController.loadProductDetails);
router.get('/shop/product/:productId', userController.loadProductDetails);

router.get('/signup', userController.loadSignup);
router.post('/signup', userController.signup);
router.post('/verify-otp', userController.verifyOtp);
router.post('/resend-otp', userController.resendOtp);

router.get('/login', userController.loadLogin);
router.post('/login', userController.login);
router.get('/logout', userController.logout)

router.get('/forgot-password', userController.loadForgotPassword);
router.post('/forgot-password', userController.sendPasswordOtp);
router.get('/forgot-password/otp', userController.loadForgotPasswordOtp)
router.post('/forgot-password/otp', userController.verifyPasswordOtp);
router.post('/forgot-password/resend', userController.resendForgotPasswordOtp);
router.get('/reset-password', userController.loadResetPassword);
router.post('/reset-password', userController.resetPassword);

router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/signup' }), (req, res) => {
    req.session.userId = req.user._id;
    return res.redirect('/')
})


router.get('/userProfile',userAuth, profileController.userProfile)

module.exports = router;

