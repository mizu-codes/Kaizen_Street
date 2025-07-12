const mongoose = require('mongoose')
const { Schema } = mongoose;

const productInfoSchema = new Schema({
    productId: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
        index: true
    },
    productName: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    deliveryStatus: {
        type: String,
        enum: ['shipped', 'delivered', 'pending', 'returned'],
        default: 'pending',
        required: true
    },
    couponApplied: {
        type: Schema.Types.ObjectId,
        ref: 'Coupon',
        default: null
    },
    paymentMethod: {
        type: String,
        enum: ['credit', 'debit', 'UPI', 'COD', 'wallet'],
        required: true
    }
}, {
    timestamps: true
})

const ProductInfo = mongoose.model('ProductInfo', productInfoSchema)
module.exports = ProductInfo;