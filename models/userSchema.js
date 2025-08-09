const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true
    },
    password: {
        type: String,
        required: false
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    cart: {
    type: Schema.Types.ObjectId,
    ref: 'Cart'
  },
    referalCode: {
        type: String,
        unique: true,
        sparse: true
    },
    avatarUrl: {
        type: String,
        default: ''
    },
    avatarPublicId: {
         type: String,
         default: ''
    },
    phone: {
        type: String,
        trim: true,
        default: ''
    },
    searchHistory: [{
        category: {
            type: Schema.Types.ObjectId,
            ref: "Category",
        },
        searchOn: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true
})

const User = mongoose.model('User', userSchema);
module.exports = User