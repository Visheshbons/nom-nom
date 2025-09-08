// ---------- INITIALISATION ---------- \\
import express from "express";
import cookieParser from "cookie-parser";

const app = express();
const port = 3000;

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

// ---------- VARIABLES ---------- \\
const orderLimit = 2;
const banLimit = 5;

// Store orders in memory (in production, use a database)
let orders = [];

// Simple admin authentication (in production, use proper auth)
const adminCredentials = {
  username: "admin",
  password: "password123",
};

// Simple session storage (in memory)
let adminSessions = new Set();

// Middleware to check admin authentication
function requireAuth(req, res, next) {
  const sessionId = req.headers.cookie
    ?.split("adminSession=")[1]
    ?.split(";")[0];
  if (sessionId && adminSessions.has(sessionId)) {
    return next();
  } else {
    return res.redirect("/admin/login");
  }
}

const menu = [
  {
    name: "Cookies",
    price: 2.5,
  },
  {
    name: "Brownies",
    price: 2,
    custom: {
      mnms: 25,
      oreos: 25,
      sprinkles: 25,
      marshmallows: 25,
      mnms: 25,
      oreos: 25,
      sprinkles: 25,
      marshmallows: 25,
      sauces: {
        choco: 50,
        caramel: 50,
        strawberry: 50,
      },
    },
  },
  {
    name: "Lemonade",
    price: 1.5,
  },
  {
    name: "Gambling",
    price: 2,
  },
];

// ---------- PATHS ---------- \\

// ---------- HOME ----------\\
app.get("/", (req, res) => {
  res.render("index.ejs", {
    menu: menu,
  });
});

// ---------- MENU ---------- \\
app.get("/menu", (req, res) => {
  res.render("menu.ejs", {
    menu: menu,
    success: req.query.success === "true",
  });
});

app.post("/pre-order", (req, res) => {
  const { item, quantity, customerName, customerEmail } = req.body;
  let userOrders = req.cookies.OrderCount || 0;

  // Find the menu item
  const menuItem = menu.find((m) => m.name === item);

  if (!menuItem) {
    return res.status(400).send("Invalid menu item");
  }

  if (userOrders >= orderLimit) {
    return res.status(400).send("Order limit reached");
  }

  // Create order
  const order = {
    id: orders.length + 1,
    item: item,
    quantity: parseInt(quantity),
    customerName: customerName,
    customerEmail: customerEmail,
    price: menuItem.price,
    total: menuItem.price * parseInt(quantity),
    timestamp: new Date(),
    status: "pending",
  };

  console.log(order);

  orders.push(order);

  userOrders++;

  // Redirect back to menu with success message
  res.cookie("OrderCount", userOrders).redirect("/menu?success=true");
});

app.get("/orders", (req, res) => {
  res.json(orders);
});

// Admin login page
app.get("/admin/login", (req, res) => {
  res.render("admin-login.ejs", { error: null });
});

// Admin login POST
app.post("/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (
    username === adminCredentials.username &&
    password === adminCredentials.password
  ) {
    const sessionId = Date.now().toString() + Math.random().toString(36);
    adminSessions.add(sessionId);
    res.cookie("adminSession", sessionId, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
    }); // 24 hours
    res.redirect("/admin");
  } else {
    res.render("admin-login.ejs", { error: "Invalid credentials" });
  }
});

// Admin logout
app.get("/admin/logout", (req, res) => {
  const sessionId = req.headers.cookie
    ?.split("adminSession=")[1]
    ?.split(";")[0];
  if (sessionId) {
    adminSessions.delete(sessionId);
  }
  res.clearCookie("adminSession");
  res.redirect("/admin/login");
});

// Admin dashboard
app.get("/admin", requireAuth, (req, res) => {
  const stats = {
    totalOrders: orders.length,
    pendingOrders: orders.filter((o) => o.status === "pending").length,
    completedOrders: orders.filter((o) => o.status === "completed").length,
    totalRevenue: orders.reduce((sum, order) => sum + order.total, 0),
  };

  res.render("admin.ejs", {
    orders: orders,
    stats: stats,
  });
});

// Update order status
app.post("/admin/orders/:id/status", requireAuth, (req, res) => {
  const orderId = parseInt(req.params.id);
  const { status } = req.body;

  const order = orders.find((o) => o.id === orderId);
  if (order) {
    order.status = status;
  }

  res.redirect("/admin");
});

// Delete order
app.delete("/admin/orders/:id", requireAuth, (req, res) => {
  const orderId = parseInt(req.params.id);
  const orderIndex = orders.findIndex((o) => o.id === orderId);

  if (orderIndex !== -1) {
    orders.splice(orderIndex, 1);
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

// Get single order details
app.get("/admin/orders/:id", requireAuth, (req, res) => {
  const orderId = parseInt(req.params.id);
  const order = orders.find((o) => o.id === orderId);

  if (order) {
    res.json(order);
  } else {
    res.status(404).json({ error: "Order not found" });
  }
});

app.post("/confirm-order/:id", (req, res) => {
  const orderId = parseInt(req.params.id);

  const order = orders.find((o) => o.id === orderId);

  if (!order) {
    return res.status(404).send("Order not found");
  }

  order.status = "confirmed";

  res.json(order);
});

app.get("/orders/:id", (req, res) => {
  const orderId = parseInt(req.params.id);

  const order = orders.find((o) => o.id === orderId);

  if (!order) {
    return res.status(404).send("Order not found");
  }

  res.json(order);
});

// ---------- ABOUT ---------- \\
app.get("/about", (req, res) => {
  res.render("about.ejs");
});

// ---------- OTHERS ---------- \\
app.use((req, res, next) => {
  res.send("ERR_404_NOT_FOUND");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
