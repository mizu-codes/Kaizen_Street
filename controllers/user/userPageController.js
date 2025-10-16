const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Cart = require('../../models/cartSchema');
const Wishlist = require('../../models/wishlistSchema');


function getBestOfferForProduct(product) {
    try {
        const productOffer = product.productOffer || 0;
        const categoryOffer = product.category?.categoryOffer || 0;

        const maxOffer = Math.max(productOffer, categoryOffer);

        if (maxOffer === 0) {
            return {
                hasOffer: false,
                discountPercentage: 0,
                offerType: null,
                originalPrice: product.regularPrice,
                finalPrice: product.regularPrice,
                discountAmount: 0
            };
        }

        let offerType;
        if (categoryOffer > productOffer) {
            offerType = 'category';
        } else if (productOffer > categoryOffer) {
            offerType = 'product';
        } else {
            offerType = 'category';
        }

        const discountAmount = (product.regularPrice * maxOffer) / 100;
        const finalPrice = product.regularPrice - discountAmount;

        return {
            hasOffer: true,
            discountPercentage: maxOffer,
            offerType: offerType,
            originalPrice: product.regularPrice,
            finalPrice: Math.round(finalPrice * 100) / 100,
            discountAmount: Math.round(discountAmount * 100) / 100
        };

    } catch (error) {
        console.error('Error calculating best offer for product:', error);
        return {
            hasOffer: false,
            discountPercentage: 0,
            offerType: null,
            originalPrice: product.regularPrice,
            finalPrice: product.regularPrice,
            discountAmount: 0
        };
    }
}

const loadHomepage = async (req, res) => {
    try {
        const userId = req.session.userId;
        const categories = await Category.find({ status: 'active' }).lean();

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
            select: 'categoryName categoryOffer',
            match: { status: 'active' }
        }).lean();

        productData = productData.filter(p => p.category);
        productData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        productData = productData.slice(0, 4);

        const productsWithOffers = productData.map(product => {
            const offerInfo = getBestOfferForProduct(product);
            return {
                ...product,
                offer: offerInfo
            };
        });

        let wishlistIds = [];
        if (userId) {
            const wishlist = await Wishlist.findOne({ userId }).lean();
            if (wishlist?.items) {
                wishlistIds = wishlist.items.map(item => item.productId.toString());
            }
        }

        return res.render('home', { products: productsWithOffers, categories, wishlistIds });
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
            status: 'active',
            $or: [
                { "stock.S": { $gt: 0 } },
                { "stock.M": { $gt: 0 } },
                { "stock.L": { $gt: 0 } },
                { "stock.XL": { $gt: 0 } },
                { "stock.XXL": { $gt: 0 } }
            ]
        };

        if (search.length) {
            filter.productName = { $regex: search, $options: 'i' };
        }
        if (category) filter.category = category;

        const priceRange = await Product.aggregate([
            {
                $match: {
                    isBlocked: false,
                    status: 'active',
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
                    minPrice: { $min: "$regularPrice" },
                    maxPrice: { $max: "$regularPrice" }
                }
            }
        ]);

        const actualMinPrice = 0;
        const actualMaxPrice = priceRange.length > 0 ? Math.ceil(priceRange[0].maxPrice) : 5000;

        const categories = await Category.find({ status: 'active' }).lean();

        let products = await Product.find(filter)
            .populate({
                path: 'category',
                select: 'categoryName status categoryOffer',
                match: { status: 'active' }
            })
            .lean();

        products = products.filter(p => p.category);

        let productsWithOffers = products.map(product => {
            const offerInfo = getBestOfferForProduct(product);
            return {
                ...product,
                offer: offerInfo,
                finalPrice: offerInfo.hasOffer ? offerInfo.finalPrice : product.regularPrice
            };
        });

        productsWithOffers = productsWithOffers.filter(p =>
            p.finalPrice >= minPrice && p.finalPrice <= maxPrice
        );

        switch (sortOption) {
            case 'low-to-high':
                productsWithOffers.sort((a, b) => a.finalPrice - b.finalPrice);
                break;
            case 'high-to-low':
                productsWithOffers.sort((a, b) => b.finalPrice - a.finalPrice);
                break;
            case 'a-to-z':
                productsWithOffers.sort((a, b) =>
                    a.productName.toLowerCase().localeCompare(b.productName.toLowerCase())
                );
                break;
            case 'z-to-a':
                productsWithOffers.sort((a, b) =>
                    b.productName.toLowerCase().localeCompare(a.productName.toLowerCase())
                );
                break;
            case 'featured':
            default:
                productsWithOffers.sort((a, b) =>
                    new Date(b.createdAt) - new Date(a.createdAt)
                );
                break;
        }

        const count = productsWithOffers.length;
        const pages = Math.ceil(count / perPage);
        const paginatedProducts = productsWithOffers.slice(
            perPage * (page - 1),
            perPage * page
        );

        res.render('shop', {
            categories,
            products: paginatedProducts,
            search,
            category,
            sort: sortOption,
            page,
            pages,
            count,
            minPrice: req.query.minPrice || actualMinPrice,
            maxPrice: req.query.maxPrice || actualMaxPrice,
            actualMinPrice,
            actualMaxPrice,
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
        console.error('Shop page error:', error);
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
        }).populate({
            path: 'category',
            select: 'categoryName status categoryOffer',
            match: { status: 'active' }
        });

        if (!productDoc || productDoc.isBlocked || !productDoc.category) {
            return res.status(404).render('page-404', { message: 'Product not found' });
        }

        const offerInfo = getBestOfferForProduct(productDoc);

        const relatedDocs = await Product.find({
            category: productDoc.category._id,
            _id: { $ne: productDoc._id },
            isBlocked: false,
            status: 'active'
        }).populate({
            path: 'category',
            select: 'categoryName categoryOffer',
            match: { status: 'active' }
        })
            .sort({ createdAt: -1 })
            .lean();

        const filtered = relatedDocs.filter(p => p.category);
        const relatedProducts = filtered.map(p => {
            const relatedOfferInfo = getBestOfferForProduct(p);
            return {
                _id: p._id,
                productName: p.productName,
                productImage: p.productImage.slice(0, 2),
                regularPrice: p.regularPrice,
                discountPrice: p.discountPrice,
                offer: relatedOfferInfo
            };
        });

        const product = {
            _id: productDoc._id,
            productName: productDoc.productName,
            category: productDoc.category._id,
            categoryName: productDoc.category.categoryName,
            regularPrice: productDoc.regularPrice,
            discountPrice: productDoc.discountPrice,
            productOffer: productDoc.productOffer,
            description: productDoc.description,
            specifications: productDoc.specifications || '',
            size: productDoc.size || [],
            stock: productDoc.stock || {},
            productImage: productDoc.productImage.slice(0, 5),
            offer: offerInfo
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

    } catch (error) {
        console.error('Error loading product details:', error);
        return res.status(500).render('500', { message: 'Internal Server Error' });
    }
};

module.exports = {
    loadHomepage,
    loadShoppingPage,
    loadProductDetails,
};