const API_URL = "http://localhost:5000";
let authToken = localStorage.getItem("inventoryToken") || "";
let currentUser = null;
let productsCache = [];
let stockChart = null;

async function login() {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();
    if (!username || !password) {
        alert("Enter username and password.");
        return;
    }

    const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
    });

    if (!res.ok) {
        const error = await res.json();
        alert(error.message || "Login failed");
        return;
    }

    const data = await res.json();
    authToken = data.token;
    localStorage.setItem("inventoryToken", authToken);
    currentUser = { username: data.username, role: data.role };
    document.getElementById("logoutButton").classList.remove("hidden");
    document.getElementById("loginPanel").classList.add("hidden");
    document.getElementById("appContainer").classList.remove("hidden");
    document.getElementById("themeToggle").classList.remove("hidden");
    loadProducts();
    loadDashboard();
}

function logout() {
    authToken = "";
    currentUser = null;
    localStorage.removeItem("inventoryToken");
    document.getElementById("logoutButton").classList.add("hidden");
    document.getElementById("loginPanel").classList.remove("hidden");
    document.getElementById("appContainer").classList.add("hidden");
}

async function loadCurrentUser() {
    if (!authToken) return;
    try {
        const res = await fetch(`${API_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        if (!res.ok) throw new Error("Invalid token");
        currentUser = await res.json();
        document.getElementById("logoutButton").classList.remove("hidden");
        document.getElementById("loginPanel").classList.add("hidden");
        document.getElementById("appContainer").classList.remove("hidden");
        loadProducts();
        loadDashboard();
    } catch (err) {
        logout();
    }
}

async function loadProducts() {
    const q = document.getElementById("searchQuery").value.trim();
    const query = q ? `?q=${encodeURIComponent(q)}` : "";
    const res = await fetch(`${API_URL}/products${query}`, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!res.ok) {
        if (res.status === 401 || res.status === 403) logout();
        return;
    }

    const products = await res.json();
    productsCache = products;
    renderProductTable(products);
    renderLowStockAlert(products);
    renderChart(products);
}

function renderProductTable(products) {
    const table = document.getElementById("productTable");
    table.innerHTML = "";

    if (!products.length) {
        table.innerHTML = `<tr><td colspan="9">No products found.</td></tr>`;
        return;
    }

    products.forEach((product, index) => {
        const canDelete = currentUser?.role === "admin";
        table.innerHTML += `
            <tr>
                <td>${index + 1}</td>
                <td>${product.name}</td>
                <td>${product.category || "General"}</td>
                <td>${product.originalStock}</td>
                <td>${product.stockRemaining}</td>
                <td>${product.reorderLevel}</td>
                <td>${new Date(product.lastUpdated).toLocaleDateString()}</td>
                <td>
                    <button onclick="editProduct('${product._id}')">Edit</button>
                    ${canDelete ? `<button class="danger" onclick="deleteProduct('${product._id}')">Delete</button>` : ""}
                </td>
            </tr>
        `;
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
    const labels = products.slice(0, 10).map(p => p.name);
    const data = products.slice(0, 10).map(p => p.stockRemaining);

    if (stockChart) stockChart.destroy();
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
    console.log("saveProduct", { id, method, url, product });

    const res = await fetch(url, {
        method,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify(product)
    });

    if (!res.ok) {
        const err = await res.json();
        alert(err.message || "Unable to save product.");
        return;
    }

    clearForm();
    loadProducts();
    loadDashboard();
}

function editProduct(id) {
    const product = productsCache.find(p => p._id === id);
    if (!product) return;
    document.getElementById("productId").value = product._id;
    document.getElementById("name").value = product.name;
    document.getElementById("category").value = product.category;
    document.getElementById("originalStock").value = product.originalStock;
    document.getElementById("stockRemaining").value = product.stockRemaining;
    document.getElementById("reorderLevel").value = product.reorderLevel;
}

async function deleteProduct(id) {
    if (!confirm("Delete this product?")) return;
    const res = await fetch(`${API_URL}/products/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!res.ok) {
        const err = await res.json();
        alert(err.message || "Unable to delete product.");
        return;
    }
    loadProducts();
    loadDashboard();
}

function clearForm() {
    document.getElementById("productId").value = "";
    document.getElementById("name").value = "";
    document.getElementById("category").value = "";
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
    const res = await fetch(`${API_URL}/dashboard-summary`, {
        headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!res.ok) return;
    const summary = await res.json();
    document.getElementById("summaryTotalItems").textContent = summary.totalItems;
    document.getElementById("summaryTotalStock").textContent = summary.totalStock;
    document.getElementById("summaryLowStock").textContent = summary.lowStockCount;
}

function exportExcel() {
    if (!productsCache.length) return alert("No products to export.");
    const headers = ["Name", "Category", "Original Stock", "Stock Remaining", "Reorder Level", "Last Updated"];
    const rows = productsCache.map(p => [p.name, p.category, p.originalStock, p.stockRemaining, p.reorderLevel, new Date(p.lastUpdated).toLocaleString()]);
    const csvContent = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "inventory-export.csv";
    link.click();
    URL.revokeObjectURL(url);
}

function exportPDF() {
    if (!productsCache.length) return alert("No products to export.");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Inventory Export", 14, 20);
    let y = 30;
    const headers = ["#", "Name", "Remaining"];
    doc.setFontSize(10);
    doc.text(headers.join(" | "), 14, y);
    y += 8;
    productsCache.slice(0, 25).forEach((p, index) => {
        const row = [index + 1, p.name, p.stockRemaining].join(" | ");
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

window.addEventListener("DOMContentLoaded", () => {
    applyTheme();
    loadCurrentUser();
});