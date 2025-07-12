const mongoose = require('mongoose');
const { Schema } = mongoose;

const walletTransactionSchema = new Schema({
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    walletId: {
        type: Schema.Types.ObjectId,
        ref: 'Wallet',
        required: true,
        index: true
    },
    transactionType: {
        type: String,
        enum: ['credit', 'debit'],
        required: true
    },
    description: {
        type: String,
        default: ''
    },
    reason: {
        type: String,
        default: ''
    },
    customerId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    }
}, {
    timestamps: true
});

const WalletTransaction = mongoose.model('WalletTransaction', walletTransactionSchema);
module.exports = WalletTransaction;
