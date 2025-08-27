const User = require('../../models/userSchema')
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Cart = require('../../models/cartSchema');

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

        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({ message: 'Product not found.' });
        }

        if (product.isBlocked || product.status !== 'active') {
            return res.status(400).json({ message: 'Product is not available.' });
        }

          const category = await Category.findById(product.category).lean();

         if (!category || category.status !== 'active') {
      return res.status(400).json({ message: 'Product category is not available.' });
    }

        if ((product.stock?.[size] || 0) < 1) {
            return res.status(400).json({ message: 'Product is out of stock for this size.' });
        }

        let cart = await Cart.findOne({ userId });
        if (!cart) {
            cart = new Cart({ userId, items: [] });
        }

        const existing = cart.items.find(item =>
            item.productId.equals(productId) && item.size === size
        );

        if (existing) {

            if (existing.quantity >= 5) {
                return res.status(400).json({ message: 'Max quantity (5) reached.' });
            }

            if (product.stock[size] < 1) {
                return res.status(400).json({ message: 'Not enough stock.' });
            }
            existing.quantity += 1;
        }
        else {
            cart.items.push({
                productId,
                quantity: 1,
                price: product.discountPrice || product.price,
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

        return res.status(200).json({
            message: 'Product added to cart successfully.',
            remainingStock: product.stock[size],
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
            return {
                _id: product._id,
                productName: product.productName,
                categoryName: product.category?.categoryName || '',
                originalPrice: product.regularPrice,
                price: item.price,
                size: item.size,
                quantity: item.quantity,
                stock: product.stock?.[item.size] || 0,
                productImage: product.productImage?.[0] || 'default.jpg',
                subtotal: item.price * item.quantity
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

module.exports = {
    addToCart,
    loadCartPage,
    updateQuantity,
    deleteQuantity
}

