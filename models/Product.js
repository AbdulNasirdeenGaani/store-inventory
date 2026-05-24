const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 100
    },
    category: {
        type: String,
        default: "General",
        trim: true,
        maxlength: 50
    },
    price: { type: Number, default: 0, min: 0 },
    originalStock: { type: Number, default: 0, min: 0 },
    stockRemaining: { type: Number, default: 0, min: 0 },
    reorderLevel: { type: Number, default: 10, min: 0 },
    lastUpdated: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Product", productSchema);