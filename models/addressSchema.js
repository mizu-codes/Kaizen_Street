const mongoose = require('mongoose');
const { Schema } = mongoose;

const addressSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    userName: {
        type: String,
        required: true
    },
    city: {
        type: String,
        required: true
    },
    locality: {
        type: String,
        required: true
    },
    houseNo: {
        type: String,
        required: true
    },
    landmark: {
        type: String,
        required: false,
        trim:true
    },
    state: {
        type: String,
        required: true
    },
    pincode: {
        type: Number,
        required: true
    },
    phoneNumber: {
        type: String,
        required: true
    },
    altPhoneNumber: {
        type: String,
        required: false,
        trim:true
    },
    addressType: {
        type: String,
        enum: ['home', 'work','other'],
        required: true
    },
    isDefault: {
    type: Boolean,
    default: false   
  }
}, {
    timestamps: true
})

const Address = mongoose.model('Address', addressSchema)
module.exports = Address
