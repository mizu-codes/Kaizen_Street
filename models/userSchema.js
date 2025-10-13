const mongoose = require('mongoose');
const { Schema } = mongoose;

async function generateUniqueReferralCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let referralCode;
    let isUnique = false;

    while (!isUnique) {
        referralCode = '';
        for (let i = 0; i < 8; i++) {
            referralCode += characters.charAt(Math.floor(Math.random() * characters.length));
        }

        const UserModel = mongoose.models.User || mongoose.model('User');
        const existingUser = await UserModel.findOne({ referalCode: referralCode });
        if (!existingUser) {
            isUnique = true;
        }
    }

    return referralCode;
}

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
    referredBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    referralRewardReceived: {
        type: Boolean,
        default: false
    },
    totalReferrals: {
        type: Number,
        default: 0
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

userSchema.pre('save', async function (next) {
    try {
        if (!this.referalCode || this.referalCode === 'undefined' || this.referalCode === '') {
            this.referalCode = await generateUniqueReferralCode();
        }
        next();
    } catch (error) {
        console.error('Error in pre-save hook:', error);
        next(error);
    }
});

const User = mongoose.model('User', userSchema);
module.exports = User