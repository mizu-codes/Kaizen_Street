const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const customerController = require('../controllers/admin/customerController');
const categoryController= require('../controllers/admin/categoryController');
const addController  = require('../controllers/admin/product/addController');
const listController = require('../controllers/admin/product/listController');
const editController = require('../controllers/admin/product/editController');
const { userAuth, adminAuth } = require('../middlewares/auth');

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
router.post('/editCategory/:id',adminAuth, categoryController.editCategory)
router.post('/deleteCategory/:id',adminAuth,categoryController.deleteCategory)
router.post('/toggleList/:id', adminAuth, categoryController.toggleList);

router.get('/addProducts',adminAuth,addController.getProductAddPage);
router.post('/addProducts', adminAuth, addController.addNewProduct);
router.get('/products', adminAuth, listController.listProducts);
router.post('/products/block/:id',adminAuth, listController.toggleBlockProduct);
router.post('/products/edit/:id', adminAuth, editController.updateProduct);


module.exports = router;