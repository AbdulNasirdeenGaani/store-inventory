const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, default: "General" },
    price: { type: Number, default: 0 },
    originalStock: { type: Number, default: 0 },
    stockRemaining: { type: Number, default: 0 },
    reorderLevel: { type: Number, default: 10 },
    lastUpdated: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Product", productSchema);