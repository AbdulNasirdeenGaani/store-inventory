const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["admin", "staff"], default: "staff" }
});

userSchema.methods.comparePassword = function(password) {
    return bcrypt.compare(password, this.passwordHash);
};

userSchema.statics.createUser = async function(username, password, role = "staff") {
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);
    return this.create({ username, passwordHash: hashed, role });
};

module.exports = mongoose.model("User", userSchema);
