const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Product = require("./models/Product");
const User = require("./models/User");

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "inventory_secret_key";
const LOW_STOCK_THRESHOLD = 10;

app.use(cors());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(express.json());

mongoose.connect("mongodb://127.0.0.1:27017/electricalStoreDB")
    .then(async () => {
        console.log("MongoDB Connected");
        const count = await User.countDocuments();
        if (count === 0) {
            await User.createUser("admin", "admin123", "admin");
            await User.createUser("staff", "staff123", "staff");
            console.log("Created default admin/admin123 and staff/staff123 users");
        }
    })
    .catch(err => console.log(err));

function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) {
        return res.status(401).json({ message: "Access token required" });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: "Invalid token" });
        req.user = user;
        next();
    });
}

function authorizeRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: "Forbidden" });
        }
        next();
    };
}

app.post("/auth/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
    }

    const user = await User.findOne({ username });
    if (!user || !(await user.comparePassword(password))) {
        return res.status(401).json({ message: "Invalid username or password" });
    }

    const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: "8h" });
    res.json({ token, role: user.role, username: user.username });
});

app.get("/auth/me", authenticateToken, (req, res) => {
    res.json({ username: req.user.username, role: req.user.role });
});

app.get("/products", authenticateToken, async (req, res) => {
    const q = req.query.q ? req.query.q.trim() : "";
    const query = {};

    if (q) {
        const regex = new RegExp(q, "i");
        query.$or = [
            { name: regex },
            // { barcode: regex },
            { category: regex }
        ];
    }

    const products = await Product.find(query).sort({ name: 1 });
    res.json(products);
});

app.post("/products", authenticateToken, authorizeRole("admin", "staff"), async (req, res) => {
    const product = new Product({
        // barcode: req.body.barcode,
        name: req.body.name,
        category: req.body.category,
        originalStock: req.body.originalStock || 0,
        stockRemaining: req.body.stockRemaining || 0,
        reorderLevel: req.body.reorderLevel || LOW_STOCK_THRESHOLD,
        lastUpdated: new Date()
    });
    await product.save();
    res.json(product);
});

app.put("/products/:id", authenticateToken, authorizeRole("admin", "staff"), async (req, res) => {
    const updatedProduct = await Product.findByIdAndUpdate(
        req.params.id,
        {
            // barcode: req.body.barcode,
            name: req.body.name,
            category: req.body.category,
            originalStock: req.body.originalStock || 0,
            stockRemaining: req.body.stockRemaining || 0,
            reorderLevel: req.body.reorderLevel || LOW_STOCK_THRESHOLD,
            lastUpdated: new Date()
        },
        { new: true }
    );
    res.json(updatedProduct);
});

app.delete("/products/:id", authenticateToken, authorizeRole("admin"), async (req, res) => {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: "Product deleted" });
});

app.get("/dashboard-summary", authenticateToken, async (req, res) => {
    const products = await Product.find();
    const totalItems = products.length;
    const totalStock = products.reduce((sum, item) => sum + (item.stockRemaining || 0), 0);
    const lowStockCount = products.filter(item => item.stockRemaining <= (item.reorderLevel || LOW_STOCK_THRESHOLD)).length;
    res.json({ totalItems, totalStock, lowStockCount, products });
});

app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});