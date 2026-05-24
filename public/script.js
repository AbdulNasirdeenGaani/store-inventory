const API_URL = "";
let currentUser = null;
let productsCache = [];
let stockChart = null;

function formatPrice(value) {
    const price = Number(value);
    return Number.isFinite(price) ? price.toFixed(2) : "0.00";
}

async function authRequest(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        credentials: "same-origin",
        headers: {
            "Content-Type": "application/json",
            ...options.headers
        }
    });

    if (response.status === 401 || response.status === 403) {
        logout();
    }

    return response;
}

async function login() {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!username || !password) {
        alert("Enter username and password.");
        return;
    }

    try {
        const response = await authRequest(`${API_URL}/auth/login`, {
            method: "POST",
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            alert(error.message || "Login failed");
            return;
        }

        const data = await response.json();
        currentUser = { username: data.username, role: data.role };
        showApp();
        await loadProducts();
        await loadDashboard();
    } catch (error) {
        alert(error.message || "Login failed due to network or server error.");
    }
}

function showSignup() {
    document.getElementById("loginPanel").classList.add("hidden");
    document.getElementById("signupPanel").classList.remove("hidden");
}

function showLogin() {
    document.getElementById("signupPanel").classList.add("hidden");
    document.getElementById("loginPanel").classList.remove("hidden");
}

function showApp() {
    document.getElementById("logoutButton").classList.remove("hidden");
    document.getElementById("loginPanel").classList.add("hidden");
    document.getElementById("signupPanel").classList.add("hidden");
    document.getElementById("appContainer").classList.remove("hidden");
    document.getElementById("themeToggle").classList.remove("hidden");
}

async function signup() {
    const username = document.getElementById("signupUsername").value.trim();
    const password = document.getElementById("signupPassword").value.trim();

    if (!username || !password) {
        alert("Enter username and password to sign up.");
        return;
    }

    try {
        const response = await authRequest(`${API_URL}/auth/signup`, {
            method: "POST",
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            alert(error.message || "Signup failed");
            return;
        }

        const data = await response.json();
        currentUser = { username: data.username, role: data.role };
        showApp();
        await loadProducts();
        await loadDashboard();
    } catch (error) {
        alert(error.message || "Signup failed due to network or server error.");
    }
}

async function logout() {
    currentUser = null;

    try {
        await fetch(`${API_URL}/auth/logout`, {
            method: "POST",
            credentials: "same-origin"
        });
    } catch (error) {
        // Ignore logout failures while resetting the UI safely.
    }

    productsCache = [];
    clearProductTable();
    document.getElementById("logoutButton").classList.add("hidden");
    document.getElementById("loginPanel").classList.remove("hidden");
    document.getElementById("appContainer").classList.add("hidden");
    document.getElementById("themeToggle").classList.add("hidden");
    document.getElementById("signupPanel").classList.add("hidden");
    document.getElementById("lowStockAlert").textContent = "All products are above reorder level.";
    document.getElementById("lowStockAlert").classList.remove("alert");
    document.getElementById("summaryTotalItems").textContent = "0";
    document.getElementById("summaryTotalStock").textContent = "0";
    document.getElementById("summaryLowStock").textContent = "0";
}

async function loadCurrentUser() {
    try {
        const response = await authRequest(`${API_URL}/auth/me`);
        if (!response.ok) {
            return;
        }

        currentUser = await response.json();
        showApp();
        await loadProducts();
        await loadDashboard();
    } catch (error) {
        await logout();
    }
}

async function loadProducts() {
    const q = document.getElementById("searchQuery").value.trim();
    const query = q ? `?q=${encodeURIComponent(q)}` : "";

    try {
        const response = await authRequest(`${API_URL}/products${query}`);
        if (!response.ok) {
            return;
        }

        const products = await response.json();
        productsCache = products;
        renderProductTable(products);
        renderLowStockAlert(products);
        renderChart(products);
    } catch (error) {
        console.error(error);
        alert("Unable to load products. Check your server or network.");
    }
}

function clearProductTable() {
    const table = document.getElementById("productTable");
    table.innerHTML = "";
}

function renderProductTable(products) {
    const table = document.getElementById("productTable");
    table.innerHTML = "";

    if (!products.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 9;
        cell.textContent = "No products found.";
        row.appendChild(cell);
        table.appendChild(row);
        return;
    }

    products.forEach((product, index) => {
        const row = document.createElement("tr");

        const cells = [
            String(index + 1),
            product.name,
            product.category || "General",
            formatPrice(product.price),
            String(product.originalStock),
            String(product.stockRemaining),
            String(product.reorderLevel),
            new Date(product.lastUpdated).toLocaleDateString(),
            ""
        ];

        cells.forEach((value, cellIndex) => {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.appendChild(cell);
        });

        const actionsCell = row.children[8];
        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.textContent = "Edit";
        editButton.addEventListener("click", () => editProduct(product._id));
        actionsCell.appendChild(editButton);

        if (currentUser?.role === "admin") {
            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "danger";
            deleteButton.textContent = "Delete";
            deleteButton.addEventListener("click", () => deleteProduct(product._id));
            actionsCell.appendChild(deleteButton);
        }

        table.appendChild(row);
    });
}

function renderLowStockAlert(products) {
    const lowStock = products.filter(item => item.stockRemaining <= item.reorderLevel);
    const alertBox = document.getElementById("lowStockAlert");

    if (!lowStock.length) {
        alertBox.textContent = "All products are above reorder level.";
        alertBox.classList.remove("alert");
        return;
    }

    alertBox.textContent = `Low stock alert: ${lowStock.length} product(s) need reorder.`;
    alertBox.classList.add("alert");
}

function renderChart(products) {
    const ctx = document.getElementById("stockChart").getContext("2d");
    const labels = products.slice(0, 10).map(product => product.name);
    const data = products.slice(0, 10).map(product => product.stockRemaining);

    if (stockChart) {
        stockChart.destroy();
    }

    stockChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "Stock Remaining",
                data,
                backgroundColor: "rgba(54, 162, 235, 0.7)"
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

async function saveProduct() {
    const id = document.getElementById("productId").value;
    const product = {
        name: document.getElementById("name").value.trim(),
        category: document.getElementById("category").value.trim(),
        price: Number(document.getElementById("price").value) || 0,
        originalStock: Number(document.getElementById("originalStock").value) || 0,
        stockRemaining: Number(document.getElementById("stockRemaining").value) || 0,
        reorderLevel: Number(document.getElementById("reorderLevel").value) || 10
    };

    if (!product.name) {
        alert("Product name is required.");
        return;
    }

    const url = id ? `${API_URL}/products/${id}` : `${API_URL}/products`;
    const method = id ? "PUT" : "POST";

    const response = await authRequest(url, {
        method,
        body: JSON.stringify(product)
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        alert(error.message || "Unable to save product.");
        return;
    }

    clearForm();
    await loadProducts();
    await loadDashboard();
}

function editProduct(id) {
    const product = productsCache.find(item => item._id === id);
    if (!product) {
        return;
    }

    document.getElementById("productId").value = product._id;
    document.getElementById("name").value = product.name;
    document.getElementById("category").value = product.category;
    document.getElementById("price").value = product.price ?? 0;
    document.getElementById("originalStock").value = product.originalStock;
    document.getElementById("stockRemaining").value = product.stockRemaining;
    document.getElementById("reorderLevel").value = product.reorderLevel;
}

async function deleteProduct(id) {
    if (!confirm("Delete this product?")) {
        return;
    }

    const response = await authRequest(`${API_URL}/products/${id}`, {
        method: "DELETE"
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        alert(error.message || "Unable to delete product.");
        return;
    }

    await loadProducts();
    await loadDashboard();
}

function clearForm() {
    document.getElementById("productId").value = "";
    document.getElementById("name").value = "";
    document.getElementById("category").value = "";
    document.getElementById("price").value = "";
    document.getElementById("originalStock").value = "";
    document.getElementById("stockRemaining").value = "";
    document.getElementById("reorderLevel").value = "";
}

function toggleTheme() {
    const body = document.body;
    body.classList.toggle("dark");
    const isDark = body.classList.contains("dark");
    localStorage.setItem("inventoryTheme", isDark ? "dark" : "light");
    document.getElementById("themeToggle").textContent = isDark ? "Light Mode" : "Dark Mode";
}

async function loadDashboard() {
    try {
        const response = await authRequest(`${API_URL}/dashboard-summary`);
        if (!response.ok) {
            return;
        }

        const summary = await response.json();
        document.getElementById("summaryTotalItems").textContent = summary.totalItems;
        document.getElementById("summaryTotalStock").textContent = summary.totalStock;
        document.getElementById("summaryLowStock").textContent = summary.lowStockCount;
    } catch (error) {
        console.error(error);
    }
}

function exportExcel() {
    if (!productsCache.length) {
        alert("No products to export.");
        return;
    }

    const headers = ["Name", "Category", "Price", "Original Stock", "Stock Remaining", "Reorder Level", "Last Updated"];
    const rows = productsCache.map(product => [
        product.name,
        product.category,
        formatPrice(product.price),
        product.originalStock,
        product.stockRemaining,
        product.reorderLevel,
        new Date(product.lastUpdated).toLocaleString()
    ]);

    const csvContent = [headers, ...rows]
        .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(","))
        .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "inventory-export.csv";
    link.click();
    URL.revokeObjectURL(url);
}

function exportPDF() {
    if (!productsCache.length) {
        alert("No products to export.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Inventory Export", 14, 20);

    let y = 30;
    const headers = ["#", "Name", "Price", "Remaining"];
    doc.setFontSize(10);
    doc.text(headers.join(" | "), 14, y);
    y += 8;

    productsCache.slice(0, 25).forEach((product, index) => {
        const row = [index + 1, product.name, formatPrice(product.price), product.stockRemaining].join(" | ");
        doc.text(row, 14, y);
        y += 6;

        if (y > 280) {
            doc.addPage();
            y = 20;
        }
    });

    doc.save("inventory-export.pdf");
}

function applyTheme() {
    const theme = localStorage.getItem("inventoryTheme") || "light";
    document.body.classList.toggle("dark", theme === "dark");
    document.getElementById("themeToggle").textContent = theme === "dark" ? "Light Mode" : "Dark Mode";
}

function bindEvents() {
    document.getElementById("loginButton").addEventListener("click", login);
    document.getElementById("signupButton").addEventListener("click", signup);
    document.getElementById("showSignupButton").addEventListener("click", showSignup);
    document.getElementById("showLoginButton").addEventListener("click", showLogin);
    document.getElementById("logoutButton").addEventListener("click", logout);
    document.getElementById("themeToggle").addEventListener("click", toggleTheme);
    document.getElementById("saveProductButton").addEventListener("click", saveProduct);
    document.getElementById("clearProductButton").addEventListener("click", clearForm);
    document.getElementById("exportExcelButton").addEventListener("click", exportExcel);
    document.getElementById("exportPDFButton").addEventListener("click", exportPDF);
    document.getElementById("searchQuery").addEventListener("input", loadProducts);
}

window.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    applyTheme();
    loadCurrentUser();
});