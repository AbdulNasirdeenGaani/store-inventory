require("dotenv").config();

const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const Product = require("./models/Product");
const User = require("./models/User");

const app = express();
const isProduction = process.env.NODE_ENV === "production";
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    throw new Error("MONGO_URI is required");
}

if (!process.env.JWT_SECRET && isProduction) {
    throw new Error("JWT_SECRET must be set in production");
}

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const LOW_STOCK_THRESHOLD = 10;
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false
});

const authCookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60 * 1000
};

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            styleSrc: ["'self'"],
            connectSrc: ["'self'"],
            imgSrc: ["'self'", "data:"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            frameAncestors: ["'none'"]
        }
    }
}));

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) {
            return callback(null, true);
        }

        if (ALLOWED_ORIGINS.length === 0) {
            return callback(new Error("CORS_ORIGINS must be configured"), false);
        }

        if (ALLOWED_ORIGINS.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error("Origin not allowed by CORS"), false);
    },
    credentials: true
}));

app.use(cookieParser());
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

mongoose.set("strictQuery", true);

mongoose.connect(MONGO_URI)
    .then(() => console.log("MongoDB Connected"))
    .catch(err => {
        console.error("MongoDB connection failed", err);
        process.exit(1);
    });

function sanitizeString(value, maxLength) {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim().slice(0, maxLength);
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toSafeNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function validateUsername(username) {
    const normalized = sanitizeString(username, 32).toLowerCase();
    if (!/^[a-z0-9_]{3,32}$/.test(normalized)) {
        return null;
    }
    return normalized;
}

function validatePassword(password) {
    const value = sanitizeString(password, 128);
    if (!/^(?=.*[A-Za-z])(?=.*\d)[^\s]{8,128}$/.test(value)) {
        return null;
    }
    return value;
}

function buildProductPayload(body) {
    const name = sanitizeString(body.name, 100);
    const category = sanitizeString(body.category, 50) || "General";
    const price = toSafeNumber(body.price, 0);
    const originalStock = toSafeNumber(body.originalStock, 0);
    const stockRemaining = toSafeNumber(body.stockRemaining, 0);
    const reorderLevel = toSafeNumber(body.reorderLevel, LOW_STOCK_THRESHOLD);

    if (!name) {
        throw Object.assign(new Error("Product name is required"), { status: 400 });
    }

    if (price < 0 || originalStock < 0 || stockRemaining < 0 || reorderLevel < 0) {
        throw Object.assign(new Error("Numeric fields cannot be negative"), { status: 400 });
    }

    return {
        name,
        category,
        price,
        originalStock,
        stockRemaining,
        reorderLevel,
        lastUpdated: new Date()
    };
}

function authenticateToken(req, res, next) {
    const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const token = bearerToken || req.cookies?.token;

    if (!token) {
        return res.status(401).json({ message: "Access token required" });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: "Invalid token" });
        }

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

app.post("/auth/login", loginLimiter, async (req, res) => {
    const username = validateUsername(req.body.username);
    const password = validatePassword(req.body.password);

    if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
    }

    const user = await User.findOne({ username });
    if (!user || !(await user.comparePassword(password))) {
        return res.status(401).json({ message: "Invalid username or password" });
    }

    const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: "8h" });

    res.cookie("token", token, authCookieOptions);
    return res.json({ role: user.role, username: user.username });
});

app.post("/auth/signup", loginLimiter, async (req, res) => {
    const username = validateUsername(req.body.username);
    const password = validatePassword(req.body.password);

    if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
        return res.status(409).json({ message: "Username is already taken" });
    }

    const newUser = await User.createUser(username, password, "staff");
    const token = jwt.sign({ id: newUser._id, username: newUser.username, role: newUser.role }, JWT_SECRET, { expiresIn: "8h" });

    res.cookie("token", token, authCookieOptions);
    return res.json({ role: newUser.role, username: newUser.username });
});

app.post("/auth/logout", (req, res) => {
    res.clearCookie("token", authCookieOptions);
    return res.json({ message: "Logged out" });
});

app.get("/auth/me", authenticateToken, (req, res) => {
    return res.json({ username: req.user.username, role: req.user.role });
});

app.get("/products", authenticateToken, async (req, res) => {
    const q = sanitizeString(req.query.q, 100);
    const query = {};

    if (q) {
        const regex = new RegExp(escapeRegExp(q), "i");
        query.$or = [
            { name: regex },
            { category: regex }
        ];
    }

    const products = await Product.find(query).sort({ name: 1 });
    const normalizedProducts = products.map(product => {
        const obj = product.toObject();
        obj.price = typeof obj.price === "number" ? obj.price : 0;
        return obj;
    });

    return res.json(normalizedProducts);
});

app.post("/products", authenticateToken, authorizeRole("admin", "staff"), async (req, res) => {
    try {
        const productData = buildProductPayload(req.body);
        const product = await Product.create(productData);
        return res.json(product.toObject());
    } catch (error) {
        return res.status(error.status || 400).json({ message: error.message || "Invalid product data" });
    }
});

app.put("/products/:id", authenticateToken, authorizeRole("admin", "staff"), async (req, res) => {
    try {
        const productData = buildProductPayload(req.body);
        const updatedProduct = await Product.findByIdAndUpdate(req.params.id, productData, {
            new: true,
            runValidators: true
        });

        if (!updatedProduct) {
            return res.status(404).json({ message: "Product not found" });
        }

        return res.json(updatedProduct.toObject());
    } catch (error) {
        if (error.name === "CastError") {
            return res.status(400).json({ message: "Invalid product id" });
        }

        return res.status(error.status || 400).json({ message: error.message || "Invalid product data" });
    }
});

app.delete("/products/:id", authenticateToken, authorizeRole("admin"), async (req, res) => {
    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
        return res.status(404).json({ message: "Product not found" });
    }

    return res.json({ message: "Product deleted" });
});

app.get("/dashboard-summary", authenticateToken, async (req, res) => {
    const products = await Product.find().sort({ name: 1 });
    const normalizedProducts = products.map(product => {
        const obj = product.toObject();
        obj.price = typeof obj.price === "number" ? obj.price : 0;
        return obj;
    });

    const totalItems = normalizedProducts.length;
    const totalStock = normalizedProducts.reduce((sum, item) => sum + (item.stockRemaining || 0), 0);
    const lowStockCount = normalizedProducts.filter(item => item.stockRemaining <= (item.reorderLevel || LOW_STOCK_THRESHOLD)).length;

    return res.json({ totalItems, totalStock, lowStockCount, products: normalizedProducts });
});

app.get("/", (req, res) => {
    return res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((req, res) => {
    return res.status(404).json({ message: "Not found" });
});

app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    console.error(err);
    const status = err.status || 500;
    const message = isProduction ? "Server error" : (err.message || "Server error");

    return res.status(status).json({ message });
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;