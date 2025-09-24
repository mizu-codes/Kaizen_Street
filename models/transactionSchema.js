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
        enum: ['razorpay', 'cod', 'wallet'],
        required: true,
        index: true
    },
    transactionStatus: {
        type: String,
        enum: ['success', 'failed', 'pending'],
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['order_payment', 'wallet_topup', 'refund'],
        required: true,
        index: true
    },
    description: {
        type: String,
        default: ''
    },
    transactionId: {
        type: String,
        unique: true,
        index: true,
        default: () => `TXN${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`
    },
    refundReason: {
        type: String,
        enum: ['return', 'cancellation', 'other'],
        default: null
    },
    gatewayTransactionId: {
        type: String,
        default: null
    },
    gatewayOrderId: {
        type: String,
        default: null
    }
}, {
    timestamps: true
});


transactionSchema.index({ customerId: 1, createdAt: -1 });
transactionSchema.index({ paymentMethod: 1, transactionStatus: 1 });
transactionSchema.index({ type: 1, createdAt: -1 });


transactionSchema.virtual('displayPurpose').get(function () {
    if (this.type === 'order_payment') {
        return 'purchased';
    } else if (this.type === 'refund') {
        if (this.refundReason === 'return') {
            return 'returned';
        } else if (this.refundReason === 'cancellation') {
            return 'cancelled';
        } else {
            return 'refunded';
        }
    } else if (this.type === 'wallet_topup') {
        return 'wallet_topup';
    }
    return 'unknown';
});


transactionSchema.virtual('shortTransactionId').get(function () {
    return this.transactionId ? this.transactionId.slice(-8).toUpperCase() : this._id.toString().slice(-8).toUpperCase();
});

transactionSchema.set('toJSON', { virtuals: true });
transactionSchema.set('toObject', { virtuals: true });

const Transaction = mongoose.model('Transaction', transactionSchema);
module.exports = Transaction;