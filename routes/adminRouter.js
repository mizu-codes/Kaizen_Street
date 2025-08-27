const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const customerController = require('../controllers/admin/customerController');
const categoryController= require('../controllers/admin/categoryController');
const addController  = require('../controllers/admin/product/addController');
const listController = require('../controllers/admin/product/listController');
const editController = require('../controllers/admin/product/editController');
const orderController = require('../controllers/admin/orderController');
const { adminAuth } = require('../middlewares/auth');

router.get('/page-error', adminController.pageError)
router.get('/login', adminController.loadLogin);
router.post('/login', adminController.login);
router.get('/', adminAuth, adminController.loadDashboard);
router.get('/logout', adminController.logout);

router.get('/user', adminAuth, customerController.customerInfo);
router.get('/user/block/:id', adminAuth, customerController.blockUser);
router.get('/user/unblock/:id', adminAuth, customerController.unblockUser);

router.get('/category',adminAuth,categoryController.categoryInfo);
router.post('/addCategory',adminAuth, categoryController.addCategory);
router.post('/editCategory/:id',adminAuth, categoryController.editCategory);
router.post('/toggleStatus/:id', adminAuth, categoryController.toggleStatus);

router.get('/addProducts',adminAuth,addController.getProductAddPage);
router.post('/addProducts', adminAuth, addController.addNewProduct);
router.get('/products', adminAuth, listController.listProducts);
router.post('/products/block/:id',adminAuth, listController.toggleBlockProduct);
router.post('/products/edit/:id', adminAuth, editController.updateProduct);

router.get('/orders',adminAuth, orderController.loadOrderPage);
router.get('/orders/:orderId', adminAuth, orderController.loadOrderDetailsPage);
router.patch('/orders/:orderId/status', adminAuth, orderController.changeOrderStatus);
router.patch('/returns/:orderId/:itemId', adminAuth, orderController.updateReturnRequest);


module.exports = router;

