const mongoose = require('mongoose');
const { Schema } = mongoose;

const walletTransactionSchema = new Schema({
    wallet: {
        type: Schema.Types.ObjectId,
        ref: 'Wallet',
        required: true,
        index: true
    },
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['credit', 'debit'],
        required: true,
        index: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0.01
    },
    description: {
        type: String,
        required: true,
        trim: true,
        maxLength: 500
    },
    transactionId: {
        type: String,
        unique: true,
        index: true,
        default: () => uuidv4()
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'cancelled'],
        default: 'completed',
        index: true
    },
    balanceBefore: {
        type: Number,
        required: true,
        min: 0
    },
    balanceAfter: {
        type: Number,
        required: true,
        min: 0
    },
    orderId: {
        type: Schema.Types.ObjectId,
        ref: 'Order',
        default: null,
        index: true
    },
    returnId: {
        type: Schema.Types.ObjectId,
        ref: 'returnAndRefund',
        default: null,
        index: true
    },
    paymentDetails: {
        method: {
            type: String,
            enum: ['cod', 'razorpay', 'wallet'],
            default: null
        },
        gatewayTransactionId: {
            type: String,
            default: null,
            index: true
        },
        gatewayOrderId: {
            type: String,
            default: null
        },
        gatewayPaymentId: {
            type: String,
            default: null
        }
    },
    failureReason: {
        type: String,
        default: null
    },
    failureCode: {
        type: String,
        default: null
    },
    processedAt: {
        type: Date,
        default: null
    },
    completedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

walletTransactionSchema.index({ user: 1, createdAt: -1 });
walletTransactionSchema.index({ wallet: 1, createdAt: -1 });

walletTransactionSchema.set('toJSON', { virtuals: true });
walletTransactionSchema.set('toObject', { virtuals: true });

const WalletTransaction = mongoose.model('WalletTransaction', walletTransactionSchema);
module.exports = WalletTransaction;