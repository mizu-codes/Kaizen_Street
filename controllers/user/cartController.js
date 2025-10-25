const User = require('../../models/userSchema')
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');

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

const addToCart = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { productId } = req.params;
        const { size } = req.body;

        if (!userId) {
            return res.status(401).json({ message: 'Please login first.' });
        }

        if (!size || !['S', 'M', 'L', 'XL', 'XXL'].includes(size)) {
            return res.status(400).json({ message: 'Invalid size.' });
        }

        const product = await Product.findById(productId).populate({
            path: 'category',
            select: 'categoryName categoryOffer status',
            match: { status: 'active' }
        });

        if (!product || product.isBlocked || product.status !== 'active') {
            return res.status(400).json({ message: 'Product is not available.' });
        }

        if (!product.category || product.category.status !== 'active') {
            return res.status(400).json({ message: 'Product category is not available.' });
        }

        const availableStock = product.stock?.[size] || 0;

        if (availableStock < 1) {
            return res.status(400).json({ message: 'Product is out of stock for this size.' });
        }

        const offerInfo = getBestOfferForProduct(product);
        const finalPrice = offerInfo.hasOffer ? offerInfo.finalPrice : product.regularPrice;

        let cart = await Cart.findOne({ userId });
        if (!cart) {
            cart = new Cart({ userId, items: [] });
        }

        const existing = cart.items.find(item =>
            item.productId.equals(productId) && item.size === size
        );

        if (existing) {
            if (existing.quantity >= 5) {
                return res.status(400).json({ message: 'Maximum quantity (5) reached for this item.' });
            }

            if (existing.quantity + 1 > availableStock) {
                return res.status(400).json({
                    message: `Only ${availableStock} items available in stock. You already have ${existing.quantity} in your cart.`
                });
            }

            existing.quantity += 1;
            existing.price = finalPrice;
        } else {
            cart.items.push({
                productId,
                quantity: 1,
                price: finalPrice,
                size
            });
        }

        await cart.save();

        const updatedCart = await Cart.findOne({ userId });
        const cartCount = updatedCart.items
            .reduce((sum, item) => sum + item.quantity, 0);

        try {
            const user = await User.findById(userId);
            if (user?.wishlist) {
                const idx = user.wishlist.findIndex(pid => pid.equals(productId));
                if (idx !== -1) {
                    user.wishlist.splice(idx, 1);
                    await user.save();
                }
            }
        } catch (wishlistError) {
            console.log('Wishlist update failed:', wishlistError);
        }

        const remainingStock = availableStock - (existing ? existing.quantity : 1);

        return res.status(200).json({
            message: 'Product added to cart successfully.',
            remainingStock: remainingStock,
            cartCount
        });

    } catch (error) {
        console.error('addToCart error:', error);
        return res.status(500).json({ message: 'Server error occurred.' });
    }
};

const loadCartPage = async (req, res) => {
    try {
        const userId = req.session.userId;

        const cart = await Cart.findOne({ userId }).populate({
            path: 'items.productId',
            populate: {
                path: 'category',
                model: 'Category',
                select: 'categoryName categoryOffer status',
                match: { status: 'active' }
            }
        });

        if (!cart || cart.items.length === 0) {
            return res.render('cart', {
                items: [],
                cartTotal: 0,
                pageTitle: 'Your Cart'
            });
        }

        const validItems = cart.items.filter(item => {
            const product = item.productId;
            return product && !product.isBlocked && product.status === 'active' && product.category;
        });

        validItems.reverse();

        const items = validItems.map(item => {
            const product = item.productId;

            const offerInfo = getBestOfferForProduct(product);
            const currentBestPrice = offerInfo.hasOffer ? offerInfo.finalPrice : product.regularPrice;

            const finalPrice = Math.min(item.price, currentBestPrice);

            return {
                _id: product._id,
                productName: product.productName,
                categoryName: product.category?.categoryName || '',
                originalPrice: product.regularPrice,
                price: finalPrice,
                size: item.size,
                quantity: item.quantity,
                stock: product.stock?.[item.size] || 0,
                productImage: product.productImage?.[0] || 'default.jpg',
                subtotal: finalPrice * item.quantity,
                hasOffer: offerInfo.hasOffer,
                discountPercentage: offerInfo.discountPercentage,
                offerType: offerInfo.offerType
            };
        });

        const cartTotal = items.reduce((sum, item) => sum + item.subtotal, 0);

        return res.render('cart', {
            items,
            cartTotal,
            pageTitle: 'Your Cart'
        });

    } catch (error) {
        console.error('Load cart page error:', error);
        return res.status(500).render('500', { message: 'Internal server error' });
    }
};

const updateQuantity = async (req, res) => {
    try {

        const userId = req.session.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Please log in first.' });
        }

        const { productId, size, quantity } = req.body;
        const qty = Math.max(1, parseInt(quantity, 10));

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ error: 'Product not found.' });
        }
        const available = product.stock?.[size] || 0;
        if (qty > available) {
            return res.status(400).json({ error: `Only ${available} left in stock.` });
        }

        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({ error: 'Cart not found.' });
        }
        const item = cart.items.find(i =>
            i.productId.equals(productId) && i.size === size
        );
        if (!item) {
            return res.status(404).json({ error: 'Item not in cart.' });
        }

        item.quantity = qty;
        await cart.save();

        await cart.populate({
            path: 'items.productId',
            select: 'regularPrice isBlocked status stock'
        });

        const subtotal = item.price * item.quantity;
        const cartTotal = cart.items
            .filter(i => {
                const p = i.productId;
                return p && !p.isBlocked && p.status === 'active';
            })
            .reduce((sum, i) => sum + i.price * i.quantity, 0);

        return res.json({ productId, size, subtotal, cartTotal, available });
    }
    catch (error) {
        console.error('updateQuantity error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
}

const deleteQuantity = async (req, res) => {
    try {
        const userId = req.session.userId;
        if (!userId) return res.status(401).json({ error: 'Please log in first.' });

        const { productId, size } = req.body;
        const cart = await Cart.findOne({ userId });
        if (!cart) return res.status(404).json({ error: 'Cart not found.' });

        const itemIndex = cart.items.findIndex(i =>
            i.productId.equals(productId) && i.size === size
        );
        if (itemIndex === -1) {
            return res.status(404).json({ error: 'Item not in cart.' });
        }

        cart.items.splice(itemIndex, 1);
        await cart.save();

        await cart.populate({ path: 'items.productId', select: 'isBlocked status stock' });
        const cartTotal = cart.items
            .filter(i => i.productId && !i.productId.isBlocked && i.productId.status === 'active')
            .reduce((sum, i) => sum + i.price * i.quantity, 0);

        return res.json({
            cartTotal,
            removedId: productId,
            removedSize: size
        });
    }
    catch (err) {
        console.error('removeItem error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
}

const checkCartStock = async (req, res) => {
    try {
        const userId = req.session.userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Please log in first.' });
        }

        const cart = await Cart.findOne({ userId }).populate({
            path: 'items.productId',
            select: 'productName stock isBlocked status'
        });

        if (!cart || cart.items.length === 0) {
            return res.json({ success: true, outOfStock: [] });
        }

        const outOfStockItems = [];

        for (let item of cart.items) {
            const product = item.productId;

            if (!product || product.isBlocked || product.status !== 'active') {
                outOfStockItems.push({
                    productId: item.productId._id,
                    productName: product?.productName || 'Unknown Product',
                    size: item.size,
                    requestedQty: item.quantity,
                    availableStock: 0,
                    reason: 'Product unavailable'
                });
                continue;
            }

            const size = item.size;
            const currentStock = product.stock[size] || 0;

            if (currentStock < item.quantity) {
                outOfStockItems.push({
                    productId: product._id,
                    productName: product.productName,
                    size: size,
                    requestedQty: item.quantity,
                    availableStock: currentStock,
                    reason: currentStock === 0 ? 'Out of stock' : 'Insufficient stock'
                });
            }
        }

        if (outOfStockItems.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Some items in your cart are out of stock',
                outOfStock: outOfStockItems
            });
        }

        return res.json({ success: true, outOfStock: [] });

    } catch (error) {
        console.error('checkCartStock error:', error);
        return res.status(500).json({ success: false, message: 'Server error occurred.' });
    }
};

module.exports = {
    addToCart,
    loadCartPage,
    updateQuantity,
    deleteQuantity,
    checkCartStock
}

