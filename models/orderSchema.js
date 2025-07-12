const mongoose = require('mongoose')
const { Schema } = mongoose;
const { v4: uuidv4 } = require('uuid');

const orderSchema = new Schema({
    orderId: {
        type: String,
        default: () => uuidv4(),
        unique: true
    },
    customerId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    shippingAddress: {
        type: Schema.Types.ObjectId,
        ref: 'Address',
        required: true
    },
    totalAmount: {
        type: Number,
        required: true,
        min: 0
    },
    paymentStatus: {
        type: String,
        enum: ['paid', 'unpaid'],
        default: 'unpaid',
        required: true
    },
    orderStatus: {
        type: String,
        enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
        default: 'pending'
    },
    couponApplied: {
        type: Schema.Types.ObjectId,
        ref: 'Coupon',
        default: null
    },
    invoiceDate: {
        type: Date,
        default: Date.now
    },
}, {
    timestamps: true
})

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;
