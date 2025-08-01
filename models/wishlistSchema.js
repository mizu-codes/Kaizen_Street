const mongoose = require('mongoose')
const { Schema } = mongoose

const wishlistItemSchema = new Schema({
    productId: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
}, {
    _id: true,
    timestamps: false
});

const wishlistSchema = new Schema({
    userId: {
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

const Wishlist = mongoose.model('Wishlist', wishlistSchema)
module.exports = Wishlist;