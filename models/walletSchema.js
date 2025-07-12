const mongoose = require('mongoose');
const { Schema } = mongoose;

const walletSchema = new Schema({
    customerId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
        unique: true
    },
    totalBalance: {
        type: Number,
        required: true,
        default: 0,
        min: 0
    }
}, {
    timestamps: true
});

const Wallet = mongoose.model('Wallet', walletSchema);
module.exports = Wallet;
