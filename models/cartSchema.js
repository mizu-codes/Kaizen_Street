const mongoose = require('mongoose')
const { Schema } = mongoose

const cartItemSchema = new Schema({
    productId: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    variantId: {
        type: Schema.Types.ObjectId,
        ref: 'Variant',
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
        default: 1
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    totalPrice: {
        type: Number,
        required: true,
        min: 0
    },
    status: {
        type: String,
        enum: ['placed', 'purchased', 'canceled'],
        default: 'placed'
    },
    cancellationReason: {
        type: String,
        default: 'none'
    }
}, {
    _id: true,
    timestamps: false
});


const cartSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    items: {
        type: [cartItemSchema],
        default: []
    }
}, {
    timestamps: true
});

const Cart = mongoose.model('Cart', cartSchema)
module.exports = Cart

