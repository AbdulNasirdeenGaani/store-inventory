const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        unique: true,
        required: true,
        trim: true,
        lowercase: true,
        minlength: 3,
        maxlength: 32,
        validate: {
            validator: value => /^[a-z0-9_]+$/.test(value),
            message: "Username can only contain lowercase letters, numbers, and underscores"
        }
    },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["admin", "staff"], default: "staff" }
});

userSchema.methods.comparePassword = function(password) {
    return bcrypt.compare(password, this.passwordHash);
};

userSchema.statics.createUser = async function(username, password, role = "staff") {
    const normalizedUsername = username.toLowerCase().trim();
    const salt = await bcrypt.genSalt(12);
    const hashed = await bcrypt.hash(password, salt);
    return this.create({ username: normalizedUsername, passwordHash: hashed, role });
};

module.exports = mongoose.model("User", userSchema);
