// ---------- INITIALISATION ---------- \\
import express from "express";
import cookieParser from "cookie-parser";
import argon2, { verify } from "argon2";
import chalk from "chalk";

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
const selfPing = false;

// Store orders in memory (in production, use a database)
let orders = [];

// Simple admin authentication (in production, use proper auth)
const adminCredentials = {
  username: "admin",
  password: "password123",
};

const ADMIN_HASH_PASSWORD =
  "$argon2id$v=19$m=65536,t=3,p=4$OhTi43nYfnrFFabeMmUziQ$cfWTaa5o2Z1s6hI2aGwJVR/Xe4AGBCrE9vClzm8lI8w";
const ADMIN_HASH_USERNAME =
  "$argon2id$v=19$m=65536,t=3,p=4$+hZ9ryGeRQBX0Zjhc9bFNA$d8fSQDyxKx2BR61woYg3lwdNr/Xwgeff8QEf+agTUic";

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

async function hashPassword(password) {
  try {
    const hash = await argon2.hash(password);
    return hash;
  } catch (err) {
    console.error(err);
  }
}

async function verifyPassword(hash, password) {
  try {
    if (await argon2.verify(hash, password)) {
      return true;
    } else {
      return false;
    }
  } catch (err) {
    console.error(err);
  }
}

const menu = [
  {
    name: "Cookies",
    price: 2.5,
    stock: 100,
    visible: true,
  },
  {
    name: "Brownies",
    price: 2,
    stock: 100,
    visible: true,
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
    stock: 100,
    visible: true,
  },
  {
    name: "Gambling",
    price: 2,
    stock: 100,
    visible: false,
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
app.post("/admin/login", async (req, res) => {
  const { username, password } = req.body;

  // if (
  //   username === adminCredentials.username &&
  //   password === ADMIN_HASH_PASSWORD
  // ) {
  //   const sessionId = Date.now().toString() + Math.random().toString(36);
  //   adminSessions.add(sessionId);
  //   res.cookie("adminSession", sessionId, {
  //     httpOnly: true,
  //     maxAge: 24 * 60 * 60 * 1000,
  //   }); // 24 hours
  //   res.redirect("/admin");
  // } else {
  //   res.render("admin-login.ejs", { error: "Invalid credentials" });
  // }

  if (await verifyPassword(ADMIN_HASH_PASSWORD, password)) {
    const sessionId = Date.now().toString() + Math.random().toString(36);
    adminSessions.add(sessionId);
    res.cookie("adminSession", sessionId, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
    }); // 24 hours
    res.redirect("/admin");
    // Log in the admin (set session/JWT/etc.)
  } else {
    res.status(401).json({ success: false, error: "Invalid credentials" });
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

app.get("/contact", (req, res) => {
  res.render("contact.ejs");
})

// ---------- OTHERS ---------- \\
app.use((req, res, next) => {
  res.send("ERR_404_NOT_FOUND");
});

app.listen(port, () => {
  console.log(`Server is running on port ${chalk.green(port)}`);
  selfTest();
});

// ---------- SELF PING ---------- \\
// This will bypass the Render free instance server shutdown
if (selfPing) {
  console.log("SELF PING ACTIVE");
  setInterval(() => {
    fetch("https://diminished-rights.onrender.com")
      .then(() => {
        console.log("SELF PING");
        console.timeEnd("Ping Interval");
        console.time("Ping Interval");
      })
      .catch((err) => {
        console.error("Ping failed:", err);
      });
  }, 600000); // 600,000 milliseconds = 10 minutes
}

async function selfTest() {
  console.log();
  console.log(
    chalk.yellowBright(`----------########### SELF TEST ###########----------`),
  );
  console.log();
  console.log(`Running Argon2 self-test...`);

  const testPassword = `testString`;
  let total = 0;

  // 1. Basic hash-verify test
  const hash1 = await argon2.hash(testPassword);
  if (await verifyPassword(hash1, testPassword)) {
    console.log(`Test 1/5: [${chalk.green("PASS")}]`);
    total++;
  } else {
    console.log(`Test 1/5: [${chalk.red("FAIL")}]`);
  }

  // 2. Different hashes for same input (checking random salt)
  const hash2 = await argon2.hash(testPassword);
  if (hash1 !== hash2) {
    console.log(`Test 2/5: [${chalk.green("PASS")}]`);
    total++;
  } else {
    console.log(`Test 2/5: [${chalk.red("FAIL")}]`);
  }

  // 3. Verify rejects wrong password
  if (!(await verifyPassword(hash1, `wrongPassword`))) {
    console.log(`Test 3/5: [${chalk.green("PASS")}]`);
    total++;
  } else {
    console.log(`Test 3/5: [${chalk.red("FAIL")}]`);
  }

  // 4. Corrupted hash detection (invalid hash string)
  const corruptedHash = hash1.slice(0, -1); // Remove last char
  let corruptedTestPassed = false;
  try {
    corruptedTestPassed = !(await verifyPassword(corruptedHash, testPassword));
  } catch {
    corruptedTestPassed = true; // Error caught means pass
  }
  if (corruptedTestPassed) {
    total++;
  }
  console.log(
    `Test 4/5: [${corruptedTestPassed ? `${chalk.green("PASS")}` : `${chalk.red("FAIL")}`}]`,
  );

  // 5. Timing check - not exact but ensures verification completes
  const start = Date.now();
  await verifyPassword(hash1, testPassword);
  const duration = Date.now() - start;
  if (duration > 0) {
    console.log(`Test 5/5: [${chalk.green("PASS")}]`);
    total++;
  } else {
    console.log(`Test 5/5: [${chalk.red("FAIL")}]`);
  }

  console.log();
  console.log(`Total tests passed: ${chalk.green(total)}`);
  if (total === 5) {
    console.log(chalk.green(`[PASS]`));
  } else {
    console.log(chalk.red(`[FAIL]`));
    console.log("Inform the developer as soon as possible");
  }

  console.log();
  console.log(
    chalk.yellowBright(`----------########### SELF TEST ###########----------`),
  );
  console.log();
}
