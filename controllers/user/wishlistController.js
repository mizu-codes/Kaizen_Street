const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Wishlist = require('../../models/wishlistSchema');

const addToWishlist = async (req, res) => {
    try {
        const userId = req.session.userId;
        const productId = req.params.productId;

        if (!userId) {
            return res.status(401).json({ message: 'Please login first.' });
        }

        const product = await Product.findById(productId);
        if (!product || product.isBlocked || product.status !== 'active') {
            return res.status(404).json({ message: 'Product is not avilable.' });
        }

        const category = await Category.findById(product.category);
        if (!category || category.status !== 'active') {
            return res.status(400).json({ message: 'Product category is not available.' });
        }

        let wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            wishlist = new Wishlist({ userId, items: [] });
        }

        const alreadyExists = wishlist.items.some(item =>
            item.productId.equals(productId)
        );

        if (alreadyExists) {
            return res.status(400).json({ message: 'Already in wishlist.' });
        }

        wishlist.items.push({ productId });
        await wishlist.save();

        return res.status(200).json({
            message: 'Product added to wishlist successfully.',
            itemCount: wishlist.items.length
        });

    } catch (error) {
        console.error('addToWishlist error:', error);
        return res.status(500).json({ message: 'Server error occurred.' });
    }
}


const loadWishlistPage = async (req, res) => {
    try {
        const userId = req.session.userId;

        const wishlistDoc = await Wishlist.findOne({ userId }).populate({
            path: 'items.productId',
            populate: {
                path: 'category',
                model: 'Category',
                match: { status: 'active' }
            }
        });

        if (!wishlistDoc || wishlistDoc.items.length === 0) {
            return res.render('wishlist', {
                items: [],
                totalValue: 0,
                pageTitle: 'Your Wishlist'
            });
        }

        const validItems = wishlistDoc.items
            .filter(item =>
                item.productId &&
                !item.productId.isBlocked &&
                item.productId.status === 'active' &&
                item.productId.category
            )
            .map(item => {
                const product = item.productId;
                return {
                    _id: product._id,
                    productName: product.productName,
                    productImage: product.productImage?.[0] || 'default.jpg',
                    discountPrice: product.discountPrice,
                    originalPrice: product.regularPrice,
                    categoryName: product.category?.categoryName || ''
                };
            })
            .reverse();

        const totalValue = validItems.reduce((sum, item) => sum + (item.discountPrice || 0), 0);

        res.render('wishlist', {
            items: validItems,
            totalValue,
            pageTitle: 'Your Wishlist'
        });

    } catch (error) {
        console.error('loadWishlistPage error:', error);
        res.status(500).render('500', { message: 'Internal server error' });
    }
};


const removeFromWishlist = async (req, res) => {
    try {
        const userId = req.session.userId;
        const productId = req.params.productId;

        if (!userId) {
            return res.status(401).json({ message: 'Please login first.' });
        }

        const wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            return res.status(404).json({ message: 'Wishlist not found.' });
        }

        const beforeCount = wishlist.items.length;

        wishlist.items = wishlist.items.filter(item =>
            !item.productId.equals(productId)
        );

        if (wishlist.items.length === beforeCount) {
            return res.status(400).json({ message: 'Item not found in wishlist.' });
        }

        await wishlist.save();

        return res.status(200).json({
            message: 'Item removed from wishlist.',
            itemCount: wishlist.items.length
        });
    } catch (err) {
        console.error('removeFromWishlist error:', err);
        return res.status(500).json({ message: 'Server error occurred.' });
    }
};

const getProductStock = async (req, res) => {
    try {
        const { productId } = req.params;

        const product = await Product.findById(productId);
        if (!product || product.isBlocked || product.status !== 'active') {
            return res.status(404).json({
                success: false,
                message: 'Product not available.'
            });
        }

        return res.status(200).json({
            success: true,
            stock: product.stock || {}
        });

    } catch (error) {
        console.error('getProductStock error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error occurred.'
        });
    }
};

module.exports = {
    addToWishlist,
    loadWishlistPage,
    removeFromWishlist,
    getProductStock
}