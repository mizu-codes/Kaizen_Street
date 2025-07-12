const mongoose = require('mongoose')
const { Schema } = mongoose

const wishlistItemSchema = new Schema({
    productId: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    variantId: {
        type: Schema.Types.ObjectId,
        ref: 'Variant',
        required: true
    }
}, { _id: false });

const wishlistSchema = new Schema({
    customerId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    items: {
        type: [wishlistItemSchema],
        default: []
    }
}, {
    timestamps: true
});

wishlistSchema.index(
    { customerId: 1, 'items.productId': 1, 'items.variantId': 1 },
    { unique: true, sparse: true }
);


const Wishlist = mongoose.model('Wishlist', wishlistSchema)
module.exports = Wishlist;