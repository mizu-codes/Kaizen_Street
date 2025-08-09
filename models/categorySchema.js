const mongoose = require('mongoose');
const { Schema } = mongoose

const categorySchema = new Schema({
    categoryName: {
        type: String,
        required: true,
        unique: true
    },
    categoryDescription: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active',
        required: true
    },
    offerId: {
        type: Schema.Types.ObjectId,
        ref: 'Offer',
        default: null
    },
},
    {
        timestamps: true
    })

const Category = mongoose.model('Category', categorySchema)
module.exports = Category
