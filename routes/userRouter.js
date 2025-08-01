const express = require('express');
const router = express.Router();
const passport = require('passport');
const upload = require('../middlewares/multer');
const profileController = require('../controllers/user/profileController');
const cartController = require('../controllers/user/cartController');
const wishlistController = require('../controllers/user/wishlistController');
const checkoutController = require('../controllers/user/checkoutController');
const { userAuth } = require('../middlewares/auth');

const errorController = require('../controllers/user/errorController');
const authController = require('../controllers/user/authController');
const passwordController = require('../controllers/user/passwordController');
const userPageController = require('../controllers/user/userPageController');

router.get('/pageNotFound', errorController.pageNotFound);

router.get('/', userPageController.loadHomepage);
router.get('/shop', userPageController.loadShoppingPage);
router.get('/products/:productId', userAuth, userPageController.loadProductDetails);
router.get('/shop/product/:productId', userAuth, userPageController.loadProductDetails);

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

router.get('/profile/security', userAuth, profileController.securityProfile);
router.post('/profile/security', userAuth, profileController.updatePassword);

router.get('/profile/addresses', userAuth, profileController.addressPage);
router.get('/profile/add-address', userAuth, profileController.addAddress);
router.post('/profile/add-address', userAuth, profileController.createAddress);
router.patch('/profile/address/set-default/:id', userAuth, profileController.setDefaultAddress);
router.delete('/profile/address/:id', userAuth, profileController.deleteAddress);
router.get('/profile/edit-address/:id', userAuth, profileController.editAddressPage);
router.patch('/profile/edit-address/:id', userAuth, profileController.updateAddress);

router.get('/cart', userAuth, cartController.loadCartPage);
router.post('/cart/add/:productId', userAuth, cartController.addToCart);
router.post('/cart/update-quantity', userAuth, cartController.updateQuantity);
router.delete('/cart/delete-quantity', userAuth, cartController.deleteQuantity);

router.get('/wishlist', userAuth, wishlistController.loadWishlistPage);
router.post('/wishlist/add/:productId', userAuth, wishlistController.addToWishlist);
router.delete('/wishlist/delete/:productId', userAuth, wishlistController.removeFromWishlist);

router.get('/checkout/place-order',userAuth,checkoutController.loadCheckoutPage);
router.post('/checkout/place-order', userAuth, checkoutController.placeOrder);
router.get('/checkout/order-success/:orderId', userAuth, checkoutController.orderSuccessPage);
router.patch('/checkout/set-default/:id', userAuth, checkoutController.setDefaultAddress);
router.delete('/checkout/address/:id', userAuth, checkoutController.deleteAddress);
router.get('/checkout/edit-address/:id', userAuth, checkoutController.editAddressPage);
router.patch('/checkout/edit-address/:id', userAuth, checkoutController.updateAddress);


module.exports = router;

