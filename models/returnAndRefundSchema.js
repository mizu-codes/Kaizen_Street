const mongoose = require('mongoose');
const { Schema } = mongoose;

const returnAndRefundSchema = new Schema({
    customerId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    orderId: {
        type: Schema.Types.ObjectId,
        ref: 'Order',
        required: true,
        index: true
    },
    reason: {
        type: String,
        required: true
    },
    description: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['pending','accepted', 'rejected'],
        default: 'pending',
        index: true
    },
    productId: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
    },
    variantId: {
        type: Schema.Types.ObjectId,
        ref: 'Variant',
        required: true
    }
}, {
    timestamps: true
});

const ReturnAndRefund = mongoose.model('ReturnAndRefund', returnAndRefundSchema);
module.exports = ReturnAndRefund;
