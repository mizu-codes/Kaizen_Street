const express = require('express');
const router = express.Router();
const upload = require('../middlewares/multer');
const cartController = require('../controllers/user/cartController');
const wishlistController = require('../controllers/user/wishlistController');
const orderController = require('../controllers/user/orderController');
const couponController = require('../controllers/user/profile/couponController');
const redirectIfLoggedIn = require('../middlewares/redirectIfLoggedIn');
const { userAuth } = require('../middlewares/auth');

const profileController = require('../controllers/user/profile/profileController');
const addressController = require('../controllers/user/profile/addressController');
const securityController = require('../controllers/user/profile/securityController');
const walletController = require('../controllers/user/profile/walletController');

const checkoutController = require('../controllers/user/checkout/checkoutController');
const addressCheckoutController = require('../controllers/user/checkout/addressController');
const retryPaymentController = require('../controllers/user/checkout/retryPaymentController');

const errorController = require('../controllers/user/errorController');
const authController = require('../controllers/user/authController');
const passwordController = require('../controllers/user/passwordController');
const userPageController = require('../controllers/user/userPageController');

router.get('/pageNotFound', errorController.pageNotFound);

router.get('/', userPageController.loadHomepage);
router.get('/shop', userPageController.loadShoppingPage);
router.get('/products/:productId', userPageController.loadProductDetails);
router.get('/shop/product/:productId', userPageController.loadProductDetails);
router.get('/checkout/order-success/:orderId', userAuth, userPageController.orderSuccessPage);
router.get('/checkout/order-failed', userAuth, userPageController.orderFailedPage);

router.get('/signup', redirectIfLoggedIn, authController.loadSignup);
router.post('/signup', authController.signup);
router.post('/verify-otp', authController.verifyOtp);
router.post('/resend-otp', authController.resendOtp);

router.get('/login', redirectIfLoggedIn, authController.loadLogin);
router.post('/login', authController.login);
router.get('/logout', authController.logout);

router.post('/validate-referral-code', authController.validateReferralCode);

router.get('/forgot-password', passwordController.loadForgotPassword);
router.post('/forgot-password', passwordController.sendPasswordOtp);
router.get('/forgot-password/otp', passwordController.loadForgotPasswordOtp);
router.post('/forgot-password/otp', passwordController.verifyPasswordOtp);
router.post('/forgot-password/resend', passwordController.resendForgotPasswordOtp);
router.get('/reset-password', passwordController.loadResetPassword);
router.post('/reset-password', passwordController.resetPassword);

router.get('/userProfile', userAuth, profileController.userProfile);
router.get('/profile/edit', userAuth, profileController.updateProfile);
router.post('/profile/update', userAuth, upload.single('avatar'), profileController.saveProfile);
router.post('/profile/verify-otp', userAuth, securityController.verifyProfileOtp);

router.get('/profile/security', userAuth, securityController.securityProfile);
router.post('/profile/security', userAuth, securityController.updatePassword);

router.get('/profile/addresses', userAuth, addressController.addressPage);
router.get('/profile/add-address', userAuth, addressController.addAddress);
router.post('/profile/add-address', userAuth, addressController.createAddress);
router.patch('/profile/address/set-default/:id', userAuth, addressController.setDefaultAddress);
router.delete('/profile/address/:id', userAuth, addressController.deleteAddress);
router.get('/profile/edit-address/:id', userAuth, addressController.editAddressPage);
router.patch('/profile/edit-address/:id', userAuth, addressController.updateAddress);

router.get('/cart/check-stock', userAuth, cartController.checkCartStock);
router.get('/cart', userAuth, cartController.loadCartPage);
router.post('/cart/add/:productId', userAuth, cartController.addToCart);
router.post('/cart/update-quantity', userAuth, cartController.updateQuantity);
router.delete('/cart/delete-quantity', userAuth, cartController.deleteQuantity);

router.get('/wishlist', userAuth, wishlistController.loadWishlistPage);
router.post('/wishlist/add/:productId', userAuth, wishlistController.addToWishlist);
router.delete('/wishlist/delete/:productId', userAuth, wishlistController.removeFromWishlist);
router.get('/api/product/:productId/stock', userAuth, wishlistController.getProductStock);

router.get('/checkout/place-order', userAuth, checkoutController.loadCheckoutPage);
router.post('/checkout/place-order', userAuth, checkoutController.placeOrder);
router.post("/checkout/create-razorpay-order", userAuth, checkoutController.createRazorpayOrder);
router.post("/checkout/verify-payment", userAuth, checkoutController.verifyRazorpayPayment);
router.get('/checkout/add-address', userAuth, addressController.addAddress);
router.post('/checkout/add-address', userAuth, addressController.createAddress);
router.patch('/checkout/set-default/:id', userAuth, addressCheckoutController.setDefaultAddress);
router.delete('/checkout/address/:id', userAuth, addressCheckoutController.deleteAddress);
router.get('/checkout/edit-address/:id', userAuth, addressCheckoutController.editAddressPage);
router.patch('/checkout/edit-address/:id', userAuth, addressCheckoutController.updateAddress);
router.post('/checkout/retry-payment', userAuth, retryPaymentController.retryPayment);

router.get('/orders', userAuth, orderController.loadOrderPage);
router.get('/orders/:orderId', userAuth, orderController.loadOrderDetailsPage);
router.patch('/orders/cancel-item/:itemId', userAuth, orderController.cancelOrderItem);
router.get('/orders/:orderId/invoice', userAuth, orderController.downloadInvoicePDF);
router.post('/orders/return-item', userAuth, orderController.returnOrderItem);
router.post('/orders/retry-payment/:orderId', userAuth, retryPaymentController.retryPaymentOrders);
router.post('/orders/verify-retry-payment', userAuth, retryPaymentController.verifyRetryPayment);

router.get('/wallet', userAuth, walletController.loadWalletPage);
router.post("/wallet/create-razorpay-order", userAuth, walletController.createWalletRazorpayOrder);
router.post("/wallet/verify-payment", userAuth, walletController.verifyWalletRazorpayPayment);

router.get('/profile/coupons', userAuth, couponController.loadCouponPage);
router.post('/checkout/apply-coupon', userAuth, couponController.applyCoupon);
router.delete('/checkout/remove-coupon', userAuth, couponController.removeCoupon);
router.get('/checkout/validate-coupon', userAuth, couponController.validateCoupon);


module.exports = router;

