const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Cart = require('../../models/cartSchema');
const Wishlist = require('../../models/wishlistSchema');

const loadHomepage = async (req, res) => {
    try {

        const userId = req.session.userId;

        const categories = await Category.find({ isListed: true });
        let productData = await Product.find({
            isBlocked: false,
            category: { $in: categories.map(category => category._id) },
            $or: [
                { "stock.S": { $gt: 0 } },
                { "stock.M": { $gt: 0 } },
                { "stock.L": { $gt: 0 } },
                { "stock.XL": { $gt: 0 } },
                { "stock.XXL": { $gt: 0 } }
            ]
        }).populate({
            path: 'category',
            select: 'categoryName',
            match: { isListed: true }
        }).lean();

        productData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        productData = productData.slice(0, 4);

        let wishlistIds = [];

        if (userId) {
            const wishlist = await Wishlist.findOne({ userId }).lean();
            if (wishlist?.items) {
                wishlistIds = wishlist.items.map(item => item.productId.toString());
            }
        }

        return res.render('home', { products: productData, categories, wishlistIds });
    } catch (error) {
        console.log('Home page load error:', error);
        return res.status(500).send('Server error');
    }
};

const loadShoppingPage = async (req, res) => {
    try {

        const userId = req.session.userId;

        const perPage = 6;
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const search = (req.query.search || '').trim();
        const category = req.query.category || '';
        const sortOption = req.query.sort || 'featured';

        const minPrice = parseFloat(req.query.minPrice) || 0;
        const maxPrice = parseFloat(req.query.maxPrice) || 5000;

        let wishlistIds = [];

        if (userId) {
            const wishlist = await Wishlist.findOne({ userId }).lean();
            if (wishlist?.items) {
                wishlistIds = wishlist.items.map(item => item.productId.toString());
            }
        }

        const filter = {
            isBlocked: false,
            $or: [
                { "stock.S": { $gt: 0 } },
                { "stock.M": { $gt: 0 } },
                { "stock.L": { $gt: 0 } },
                { "stock.XL": { $gt: 0 } },
                { "stock.XXL": { $gt: 0 } }
            ]
        };

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
            {
                $match: {
                    isBlocked: false,
                    $or: [
                        { "stock.S": { $gt: 0 } },
                        { "stock.M": { $gt: 0 } },
                        { "stock.L": { $gt: 0 } },
                        { "stock.XL": { $gt: 0 } },
                        { "stock.XXL": { $gt: 0 } }
                    ]
                }
            },
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
            },
            wishlistIds
        });
    } catch (error) {
        console.error('Shope page error:', error);
        res.redirect('/pageNotFound');
    }
};

const loadProductDetails = async (req, res) => {
    try {
        const userId = req.session.userId;
        const productId = req.params.productId;

        const productDoc = await Product.findOne({
            _id: productId,
            isBlocked: false,
            status: 'active',
            $or: [
                { "stock.S": { $gt: 0 } },
                { "stock.M": { $gt: 0 } },
                { "stock.L": { $gt: 0 } },
                { "stock.XL": { $gt: 0 } },
                { "stock.XXL": { $gt: 0 } }
            ]
        }).populate('category');


        if (!productDoc) {
            return res.status(404).render('page-404', { message: 'Product not found' });
        }

        if (productDoc.isBlocked) {
            return res.status(404).render('page-404', { message: 'Product not found' });
        }

        if (productDoc.category && productDoc.category.isBlocked) {
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
            status: 'active'
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
            size: productDoc.size || [],
            stock: productDoc.stock || {},
            productImage: productDoc.productImage.slice(0, 5)
        };

        let cartCount = 0;
        if (userId) {
            const cart = await Cart.findOne({ userId });
            if (cart && cart.items.length) {
                cartCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
            }
        }

        let wishlistIds = [];
        if (userId) {
            const wishlistDoc = await Wishlist.findOne({ userId }).lean();
            if (wishlistDoc?.items) {
                wishlistIds = wishlistDoc.items.map(i => i.productId.toString());
            }
        }

        return res.render('product-details', {
            product,
            relatedProducts,
            pageTitle: product.productName,
            selectedSize: null,
            cartItemCount: cartCount,
            wishlistIds,             
            isInWishlist: wishlistIds.includes(product._id.toString())
        });

    } catch (err) {
        console.error('Error loading product details:', err);
        return res.status(500).render('500', { message: 'Internal Server Error' });
    }
};


module.exports = {
    loadHomepage,
    loadShoppingPage,
    loadProductDetails,
}