const mongoose = require('mongoose');
const { Schema } = mongoose;

const walletSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
        index: true
    },
    balance: {
        type: Number,
        default: 0,
        min: 0,
        validate: {
            validator: function (value) {
                return value >= 0;
            },
            message: 'Wallet balance cannot be negative'
        }
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    isBlocked: {
        type: Boolean,
        default: false,
        index: true
    },
    totalCredits: {
        type: Number,
        default: 0,
        min: 0
    },
    totalDebits: {
        type: Number,
        default: 0,
        min: 0
    },
    transactionCount: {
        type: Number,
        default: 0,
        min: 0
    },
    lastTransactionAt: {
        type: Date,
        default: null
    },
    lastCreditAt: {
        type: Date,
        default: null
    },
    lastDebitAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

walletSchema.index({ isActive: 1, isBlocked: 1 });

walletSchema.set('toJSON', { virtuals: true });
walletSchema.set('toObject', { virtuals: true });

const Wallet = mongoose.model('Wallet', walletSchema);
module.exports = Wallet;
