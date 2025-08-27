const mongoose = require('mongoose')
const { Schema } = mongoose;

const transactionSchema = new Schema({
    customerId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    orderId: {
        type: Schema.Types.ObjectId,
        ref: 'Order',
        default: null,
        index: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    paymentMethod: {
        type: String,
        enum: ['UPI', 'COD', 'wallet'],
        required: true
    },
    transactionStatus: {
        type: String,
        enum: ['success', 'failed', 'pending'],
        required: true
    },
    type: {
        type: String,
        enum: ['order_payment', 'wallet_topup', 'refund'],
        required: true
    },
    description: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

const Transaction = mongoose.model('Transaction', transactionSchema);
module.exports = Transaction;