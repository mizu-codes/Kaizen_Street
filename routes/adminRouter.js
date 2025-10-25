const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const customerController = require('../controllers/admin/customerController');
const categoryController = require('../controllers/admin/categoryController');
const addController = require('../controllers/admin/product/addController');
const listController = require('../controllers/admin/product/listController');
const editController = require('../controllers/admin/product/editController');
const orderController = require('../controllers/admin/orderController');
const transactionController = require('../controllers/admin/transactionController');
const couponController = require('../controllers/admin/couponController');
const salesController = require('../controllers/admin/salesController');
const dashboardController = require('../controllers/admin/dashboardController');
const { adminAuth } = require('../middlewares/auth');
const { upload, handleUploadError } = require('../middlewares/multer');

router.get('/page-error', adminController.pageError)
router.get('/login', adminController.loadLogin);
router.post('/login', adminController.login);
router.get('/', adminAuth, dashboardController.loadDashboard);
router.get('/logout', adminController.logout);

router.get('/user', adminAuth, customerController.customerInfo);
router.get('/user/block/:id', adminAuth, customerController.blockUser);
router.get('/user/unblock/:id', adminAuth, customerController.unblockUser);

router.get('/category', adminAuth, categoryController.categoryInfo);
router.post('/addCategory', adminAuth, categoryController.addCategory);
router.post('/editCategory/:id', adminAuth, categoryController.editCategory);
router.post('/toggleStatus/:id', adminAuth, categoryController.toggleStatus);
router.post('/addCategoryOffer/:id', adminAuth, categoryController.addCategoryOffer);
router.post('/removeCategoryOffer/:id', adminAuth, categoryController.removeCategoryOffer);

router.get('/addProducts', adminAuth, addController.getProductAddPage);
router.post('/addProducts', adminAuth, upload.array('images', 3), handleUploadError, addController.addNewProduct)
router.get('/products', adminAuth, listController.listProducts);
router.post('/products/block/:id', adminAuth, listController.toggleBlockProduct);
router.post('/products/edit/:id', adminAuth, upload.array('productImages', 3), handleUploadError, editController.updateProduct);

router.get('/orders', adminAuth, orderController.loadOrderPage);
router.get('/orders/:orderId', adminAuth, orderController.loadOrderDetailsPage);
router.patch('/orders/:orderId/status', adminAuth, orderController.changeOrderStatus);
router.patch('/returns/:orderId/:itemId', adminAuth, orderController.updateReturnRequest);
router.patch('/orders/:orderId/items/:itemId/status', adminAuth, orderController.updateItemStatus);

router.get('/transactions', adminAuth, transactionController.loadTransactionsPage);
router.get('/transactions/:id', adminAuth, transactionController.getTransactionDetails);

router.get('/coupons', adminAuth, couponController.loadCouponPage);
router.post('/coupons/add', adminAuth, couponController.addCoupon);
router.delete('/coupons/delete/:id', adminAuth, couponController.deleteCoupon);
router.put('/coupons/edit/:id', adminAuth, couponController.updateCoupon);
router.get('/coupons/data/:id', adminAuth, couponController.getCouponData);


router.get('/sales-report', adminAuth, salesController.loadSalesReport);
router.post('/sales-report/generate', adminAuth, salesController.generateReport);
router.get('/sales-report/download', adminAuth, salesController.downloadReport);


module.exports = router;

