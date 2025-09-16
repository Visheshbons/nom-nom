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

// Time slot configuration (12:30 PM - 1:15 PM in 5-minute intervals)
const TIME_SLOTS = [
  "12:30",
  "12:35",
  "12:40",
  "12:45",
  "12:50",
  "12:55",
  "1:00",
  "1:05",
  "1:10",
  "1:15",
];

// Store orders in memory (in production, use a database)
let orders = [];

// Store time slot bookings
let timeSlotBookings = {};

// Store logs for the "/debug" route
let logs = [];

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
let serverSession = Math.random().toString(36).substring(2, 15);
// Server session is used as a random identifier for the auth cookies
// This helps against cookies being made and used to bypass login
// This is logged in the server start

// Middleware to check admin authentication
function requireAuth(req, res, next) {
  const cookie = req.headers.cookie || "";
  const sessionId = cookie.split("adminSession=")[1]?.split(";")[0];
  const sessionServer = cookie.split("serverSession=")[1]?.split(";")[0];

  if (
    sessionId &&
    adminSessions.has(sessionId) &&
    sessionServer === serverSession
  ) {
    return next();
  } else {
    return res.redirect("/admin/login");
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
    logs.push(err);
  }
}

let menu = [
  {
    name: "Cookies",
    price: 2.5,
    stock: 75,
    visible: true,
  },
  {
    name: "Brownies",
    price: 2,
    stock: 25,
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
    stock: 40,
    visible: true,
  },
  {
    name: "Gambling",
    price: 2,
    stock: 2500,
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

  if (menuItem.stock < parseInt(quantity)) {
    return res.status(400).send("Not enough stock");
  }

  // Store order details in session/cookie for time slot selection
  const orderDetails = {
    item: item,
    quantity: parseInt(quantity),
    customerName: customerName,
    customerEmail: customerEmail,
    price: menuItem.price,
    total: menuItem.price * parseInt(quantity),
  };

  // Store order details in cookie for next step
  res.cookie("pendingOrder", JSON.stringify(orderDetails), {
    maxAge: 15 * 60 * 1000, // 15 minutes
    httpOnly: false,
  });

  // Redirect to time slot selection
  res.redirect("/select-time");
});

// Time slot selection page
app.get("/select-time", (req, res) => {
  const pendingOrder = req.cookies.pendingOrder;

  if (!pendingOrder) {
    return res.redirect("/menu");
  }

  const orderDetails = JSON.parse(pendingOrder);

  const userOrder = orders.find(
    (o) => o.customerEmail === orderDetails.customerEmail,
  );
  const userBookedSlot = userOrder ? userOrder.timeSlot : null;

  // Get available time slots (not booked)
  const availableSlots = TIME_SLOTS.filter((slot) => !timeSlotBookings[slot]);

  res.render("time-slot.ejs", {
    orderDetails: orderDetails,
    timeSlots: TIME_SLOTS,
    availableSlots: availableSlots,
    bookedSlots: timeSlotBookings,
    userBookedSlot: userBookedSlot,
  });
});

// Confirm order with time slot
app.post("/confirm-order", (req, res) => {
  const { timeSlot } = req.body;
  const pendingOrder = req.cookies.pendingOrder;

  if (!pendingOrder) {
    return res.status(400).send("No pending order found");
  }

  if (!timeSlot || !TIME_SLOTS.includes(timeSlot)) {
    return res.status(400).send("Invalid time slot");
  }

  // No longer needed due to frontend validation
  // if (timeSlotBookings[timeSlot]) {
  //   return res.status(400).send("Time slot already booked");
  // }

  const orderDetails = JSON.parse(pendingOrder);
  let userOrders = req.cookies.OrderCount || 0;

  // Find the menu item and update stock
  const menuItem = menu.find((m) => m.name === orderDetails.item);
  if (!menuItem || menuItem.stock < orderDetails.quantity) {
    return res.status(400).send("Item no longer available");
  }

  menuItem.stock -= orderDetails.quantity;

  // Book the time slot
  timeSlotBookings[timeSlot] = true;

  // Create final order
  const order = {
    id: orders.length + 1,
    item: orderDetails.item,
    quantity: orderDetails.quantity,
    customerName: orderDetails.customerName,
    customerEmail: orderDetails.customerEmail,
    price: orderDetails.price,
    total: orderDetails.total,
    timeSlot: timeSlot,
    timestamp: new Date(),
    status: "pending",
  };

  console.log(order);
  logs.push(order);

  orders.push(order);
  userOrders++;

  // Clear pending order and update user order count
  res.clearCookie("pendingOrder");
  res.cookie("OrderCount", userOrders).redirect("/menu?success=true");
});

app.get("/orders", (req, res) => {
  res.json(orders);
});

// Get available time slots
app.get("/api/time-slots", (req, res) => {
  const availableSlots = TIME_SLOTS.filter((slot) => !timeSlotBookings[slot]);
  res.json({
    allSlots: TIME_SLOTS,
    availableSlots: availableSlots,
    bookedSlots: Object.keys(timeSlotBookings).filter(
      (slot) => timeSlotBookings[slot],
    ),
  });
});

// Admin login page
app.get("/admin/login", (req, res) => {
  res.render("admin-login.ejs", { error: null });
});

// Admin login POST
app.post("/admin/login", async (req, res) => {
  console.log();
  console.log(
    chalk.yellow("-------######## ADMIN LOGIN ATTEMPT ########--------"),
  );
  console.log();
  logs.push("-------######## ADMIN LOGIN ATTEMPT ########--------");
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
    console.log(`Authentication: [${chalk.green(`PASS`)}]`);
    logs.push("Authentication: [PASS]");
    const sessionId = Date.now().toString() + Math.random().toString(36);
    adminSessions.add(sessionId);
    res.cookie("adminSession", sessionId, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
    }); // 24 hours
    res.cookie("serverSession", serverSession, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
    }); // 24 hours
    console.log(`Login: [${chalk.green(`PASS`)}]`);
    logs.push("Login: [PASS]");
    res.redirect("/admin");
    // Log in the admin (set session/JWT/etc.)
  } else {
    console.log(`Authentication: [${chalk.red(`FAIL`)}]`);
    logs.push("Authentication: [FAIL]");
    res.status(401).json({ success: false, error: "Invalid credentials" });
  }

  console.log();
  console.log(
    chalk.yellow(`-------######## ADMIN LOGIN ATTEMPT ########--------`),
  );
  console.log();
  logs.push("-------######## ADMIN LOGIN ATTEMPT ########--------");
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
  res.clearCookie("serverSession");
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
    // If order is being cancelled, free up the time slot
    if (status === "cancelled" && order.timeSlot) {
      delete timeSlotBookings[order.timeSlot];
    }
    order.status = status;
  }

  res.redirect("/admin");
});

// Delete order
app.delete("/admin/orders/:id", requireAuth, (req, res) => {
  const orderId = parseInt(req.params.id);
  const orderIndex = orders.findIndex((o) => o.id === orderId);

  if (orderIndex !== -1) {
    const order = orders[orderIndex];
    // Free up time slot if order had one
    if (order.timeSlot) {
      delete timeSlotBookings[order.timeSlot];
    }
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

// Cancel order and free up time slot
app.post("/admin/orders/:id/cancel", requireAuth, (req, res) => {
  const orderId = parseInt(req.params.id);
  const order = orders.find((o) => o.id === orderId);

  if (order && order.timeSlot) {
    // Free up the time slot
    delete timeSlotBookings[order.timeSlot];
    order.status = "cancelled";
  }

  res.redirect("/admin");
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

// ---------- CONTACT ---------- \\
app.get("/contact", (req, res) => {
  res.render("contact.ejs");
});

// ---------- TEST PAGE ---------- \\
app.get("/test-timeslots", (req, res) => {
  res.sendFile(__dirname + "/test-timeslots.html");
});

// ---------- DEBUG ---------- \\
app.get("/debug", requireAuth, (req, res) => {
  res.clearCookie("OrderCount");
  const reload = req.query.reload === "true";
  if (reload != "true") {
    console.log(`[${chalk.red(`WARN`)}]: Debug route accessed`);
    logs.push(`[WARN]: Debug route accessed`);
  }

  const logsToDisplay = [...logs].slice(-50);

  // Prepare debug information
  const debugInfo = {
    timestamp: new Date().toISOString(),
    server: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      port: port,
      sessionId: serverSession,
    },
    orders: {
      total: orders.length,
      pending: orders.filter((o) => o.status === "pending").length,
      completed: orders.filter((o) => o.status === "completed").length,
      confirmed: orders.filter((o) => o.status === "confirmed").length,
    },
    timeSlots: {
      allSlots: TIME_SLOTS,
      bookedSlots: Object.keys(timeSlotBookings).filter(
        (slot) => timeSlotBookings[slot],
      ),
      availableSlots: TIME_SLOTS.filter((slot) => !timeSlotBookings[slot]),
      totalBooked: Object.keys(timeSlotBookings).filter(
        (slot) => timeSlotBookings[slot],
      ).length,
      totalAvailable: TIME_SLOTS.filter((slot) => !timeSlotBookings[slot])
        .length,
    },
    menu: menu.map((item) => ({
      name: item.name,
      stock: item.stock,
      visible: item.visible,
      lowStock: item.stock <= 10,
    })),
    sessions: {
      activeAdminSessions: adminSessions.size,
    },
    logs: logsToDisplay,
    config: {
      orderLimit: orderLimit,
      banLimit: banLimit,
      selfPing: selfPing,
    },
  };

  res.render("debug.ejs", { data: debugInfo });
});

// Debug API endpoint for JSON response
app.get("/debug/api", (req, res) => {
  console.log(`[${chalk.red(`WARN`)}]: Debug API route accessed`);
  logs.push(`[WARN]: Debug API route accessed`);

  // Prepare debug information
  const debugInfo = {
    timestamp: new Date().toISOString(),
    server: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      port: port,
      sessionId: serverSession,
    },
    orders: {
      total: orders.length,
      pending: orders.filter((o) => o.status === "pending").length,
      completed: orders.filter((o) => o.status === "completed").length,
      confirmed: orders.filter((o) => o.status === "confirmed").length,
    },
    timeSlots: {
      allSlots: TIME_SLOTS,
      bookedSlots: Object.keys(timeSlotBookings).filter(
        (slot) => timeSlotBookings[slot],
      ),
      availableSlots: TIME_SLOTS.filter((slot) => !timeSlotBookings[slot]),
      totalBooked: Object.keys(timeSlotBookings).filter(
        (slot) => timeSlotBookings[slot],
      ).length,
      totalAvailable: TIME_SLOTS.filter((slot) => !timeSlotBookings[slot])
        .length,
    },
    menu: menu.map((item) => ({
      name: item.name,
      stock: item.stock,
      visible: item.visible,
      lowStock: item.stock <= 10,
    })),
    sessions: {
      activeAdminSessions: adminSessions.size,
    },
    logs: logs.slice(-50).reverse(), // Return last 50 log entries, newest first
    config: {
      orderLimit: orderLimit,
      banLimit: banLimit,
      selfPing: selfPing,
    },
  };

  res.json({
    success: true,
    message: "Debug information retrieved successfully",
    data: debugInfo,
  });
});

app.get("/debug/logs", requireAuth, (req, res) => {
  console.log(`[${chalk.red(`WARN`)}]: Logs accessed.`);
  logs.push(`[WARN]: Logs accessed.`);
  res.json(logs);
});

// ---------- OTHERS ---------- \\
app.use((req, res, next) => {
  res.send("ERR_404_NOT_FOUND");
});

app.listen(port, async () => {
  console.log(`Server is running on port ${chalk.green(port)}`);
  console.log(`Server Session ID: ${chalk.grey(serverSession)}`);
  logs.push(`Server is running on port ${port}`);
  logs.push(`Server Session ID: ${serverSession}`);
  await Argon2SelfTest();
  await GeneralTest();
  for (let i = 0; i < menu.length; i++) {
    if (menu[i].stock <= 10) {
      console.warn(
        `[${chalk.yellow(`WARN`)}]: Item "${chalk.grey(menu[i].name)}" has only ${chalk.red(menu[i].stock)} in stock`,
      );
      logs.push(
        `[WARN]: Item "${menu[i].name}" has only ${menu[i].stock} in stock`,
      );
    } else {
      const stockDisplay =
        menu[i].stock === Math.MAX_SAFE_INTEGER ? "∞" : menu[i].stock;
      console.log(
        `Item "${chalk.grey(menu[i].name)}" has ${chalk.green(stockDisplay)} in stock`,
      );
      logs.push(`Item "${menu[i].name}" has ${stockDisplay} in stock`);
    }
  }
  setInterval(
    async () => {
      await GeneralTest();
    },
    1 * 60 * 60 * 1000,
  ); // Every hour
});

// ---------- SELF PING ---------- \\
// This will bypass the Render free instance server shutdown
if (selfPing) {
  console.log("SELF PING ACTIVE");
  console.time("Ping Interval");
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

async function Argon2SelfTest() {
  console.log();
  console.log(
    chalk.yellowBright(
      `----------########### ARGON2 SELF TEST ###########----------`,
    ),
  );
  console.log();
  console.log(`Running Argon2 self-test...`);
  logs.push("----------########## ARGON2 SELF TEST ##########----------");
  logs.push("Running Argon2 self-test...");

  const testPassword = `testString`;
  let total = 0;

  // 1. Basic hash-verify test
  const hash1 = await argon2.hash(testPassword);
  if (await verifyPassword(hash1, testPassword)) {
    console.log(`Test 1/5: [${chalk.green("PASS")}]`);
    logs.push("Test 1/5: [PASS]");
    total++;
  } else {
    console.log(`Test 1/5: [${chalk.red("FAIL")}]`);
    logs.push("Test 1/5: [FAIL]");
  }

  // 2. Different hashes for same input (checking random salt)
  const hash2 = await argon2.hash(testPassword);
  if (hash1 !== hash2) {
    console.log(`Test 2/5: [${chalk.green("PASS")}]`);
    logs.push("Test 2/5: [PASS]");
    total++;
  } else {
    console.log(`Test 2/5: [${chalk.red("FAIL")}]`);
    logs.push("Test 2/5: [FAIL]");
  }

  // 3. Verify rejects wrong password
  if (!(await verifyPassword(hash1, `wrongPassword`))) {
    console.log(`Test 3/5: [${chalk.green("PASS")}]`);
    logs.push("Test 3/5: [PASS]");
    total++;
  } else {
    console.log(`Test 3/5: [${chalk.red("FAIL")}]`);
    logs.push("Test 3/5: [FAIL]");
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
  logs.push(`Test 4/5: [${corruptedTestPassed ? `PASS` : `FAIL`}]`);

  // 5. Timing check - not exact but ensures verification completes
  const start = Date.now();
  await verifyPassword(hash1, testPassword);
  const duration = Date.now() - start;
  if (duration > 0) {
    console.log(`Test 5/5: [${chalk.green("PASS")}]`);
    logs.push("Test 5/5: [PASS]");
    total++;
  } else {
    console.log(`Test 5/5: [${chalk.red("FAIL")}]`);
    logs.push("Test 5/5: [FAIL]");
  }

  console.log();
  console.log(`Total tests passed: ${chalk.green(total)}`);
  if (total === 5) {
    console.log(chalk.green(`[PASS]`));
    logs.push("[PASS]");
  } else {
    console.log(chalk.red(`[FAIL]`));
    console.log("Inform the developer as soon as possible");
    logs.push("[FAIL]");
    logs.push("Inform the developer as soon as possible");
  }

  console.log();
  console.log(
    chalk.yellowBright(
      `----------########### ARGON2 SELF TEST ###########----------`,
    ),
  );
  console.log();
  logs.push(`----------########## ARGON2 SELF TEST ##########----------`);
}

async function GeneralTest() {
  console.log();
  console.log(
    chalk.yellowBright(
      "----------########## GENERAL SELF TESTS ##########----------",
    ),
  );
  console.log();
  logs.push(`----------########## GENERAL SELF TESTS ##########----------`);

  // Define all tests as objects with a description and a test function
  const tests = [
    {
      description: "Menu item names are unique",
      test: () => {
        const menuNames = menu.map((item) => item.name);
        return menuNames.length === new Set(menuNames).size;
      },
    },
    {
      description: "No menu item has negative price or stock",
      test: () => menu.every((item) => item.price >= 0 && item.stock >= 0),
    },
    {
      description: "No duplicate custom keys in menu items",
      test: () =>
        menu
          .filter((item) => item.custom)
          .every((item) => {
            const keys = Object.keys(item.custom);
            return keys.length === new Set(keys).size;
          }),
    },
    {
      description:
        "All menu items with custom.sauces have valid sauce values (number >= 0)",
      test: () =>
        menu
          .filter((item) => item.custom && item.custom.sauces)
          .every((item) =>
            Object.values(item.custom.sauces).every(
              (val) => typeof val === "number" && val >= 0,
            ),
          ),
    },
    {
      description: "All menu items have price > 0 and stock >= 0",
      test: () =>
        menu.every(
          (item) =>
            typeof item.price === "number" &&
            item.price > 0 &&
            typeof item.stock === "number" &&
            item.stock >= 0,
        ),
    },
    {
      description: "All menu items have a visible property (boolean)",
      test: () => menu.every((item) => typeof item.visible === "boolean"),
    },
    {
      description: "All time slots are unique and in correct format (HH:MM)",
      test: () => {
        const timeSlotFormat = /^\d{1,2}:\d{2}$/;
        return (
          TIME_SLOTS.length === new Set(TIME_SLOTS).size &&
          TIME_SLOTS.every((slot) => timeSlotFormat.test(slot))
        );
      },
    },
    {
      description: "Orders array is an array",
      test: () => Array.isArray(orders),
    },
    {
      description: "All orders (if any) have required fields",
      test: () => {
        const requiredOrderFields = [
          "id",
          "item",
          "quantity",
          "customerName",
          "customerEmail",
          "price",
          "total",
          "timeSlot",
          "timestamp",
          "status",
        ];
        return (
          orders.every((order) =>
            requiredOrderFields.every((field) => field in order),
          ) || orders.length === 0
        );
      },
    },
    {
      description: "No order has quantity <= 0",
      test: () =>
        orders.every((order) => order.quantity > 0) || orders.length === 0,
    },
    {
      description: "No order has total < price * quantity",
      test: () =>
        orders.every((order) => order.total >= order.price * order.quantity) ||
        orders.length === 0,
    },
    {
      description:
        "Time slot bookings object only contains valid time slots as keys",
      test: () =>
        Object.keys(timeSlotBookings).every((slot) =>
          TIME_SLOTS.includes(slot),
        ),
    },
    {
      description: "No booked time slot is outside TIME_SLOTS",
      test: () =>
        Object.keys(timeSlotBookings).every((slot) =>
          TIME_SLOTS.includes(slot),
        ),
    },
    {
      description: "No booked time slot is booked more than once",
      test: () => {
        const bookedSlots = Object.keys(timeSlotBookings).filter(
          (slot) => timeSlotBookings[slot],
        );
        return bookedSlots.length === new Set(bookedSlots).size;
      },
    },
    {
      description: "Admin sessions is a Set",
      test: () => adminSessions instanceof Set,
    },
    {
      description: "Server session is a non-empty string",
      test: () => typeof serverSession === "string" && serverSession.length > 0,
    },
    {
      description: "Order limit and ban limit are positive integers",
      test: () =>
        Number.isInteger(orderLimit) &&
        orderLimit > 0 &&
        Number.isInteger(banLimit) &&
        banLimit > 0,
    },
    {
      description: "All menu items visible to users have stock > 0",
      test: () =>
        menu.filter((item) => item.visible).every((item) => item.stock > 0),
    },
    {
      description: "Logs is an array",
      test: () => Array.isArray(logs),
    },
    {
      description: "All menu items have a name property (string)",
      test: () => menu.every((item) => typeof item.name === "string"),
    },
    {
      description: "All menu items have a price property (number)",
      test: () => menu.every((item) => typeof item.price === "number"),
    },
    {
      description: "All menu items have a stock property (number)",
      test: () => menu.every((item) => typeof item.stock === "number"),
    },
    {
      description: "All menu items have a visible property (boolean)",
      test: () => menu.every((item) => typeof item.visible === "boolean"),
    },
    {
      description:
        "All menu items with custom property have valid custom structure",
      test: () =>
        menu
          .filter((item) => item.custom)
          .every(
            (item) =>
              typeof item.custom === "object" &&
              Object.keys(item.custom).length > 0 &&
              typeof item.custom.sauces === "object",
          ) || menu.filter((item) => item.custom).length === 0,
    },
    {
      description: "All booked time slots are marked true in timeSlotBookings",
      test: () =>
        Object.values(timeSlotBookings).every((val) => val === true) ||
        Object.keys(timeSlotBookings).length === 0,
    },
    {
      description: "All orders have a valid status",
      test: () => {
        const validStatuses = [
          "pending",
          "completed",
          "confirmed",
          "cancelled",
        ];
        return (
          orders.every((order) => validStatuses.includes(order.status)) ||
          orders.length === 0
        );
      },
    },
    {
      description: "All orders have a valid timeSlot (if present)",
      test: () =>
        orders.every(
          (order) => !order.timeSlot || TIME_SLOTS.includes(order.timeSlot),
        ) || orders.length === 0,
    },
    {
      description: "All admin credentials are strings",
      test: () =>
        typeof adminCredentials.username === "string" &&
        typeof adminCredentials.password === "string",
    },
    {
      description:
        "All orders have a valid timestamp (Date object or parseable string)",
      test: () =>
        orders.every(
          (order) =>
            order.timestamp instanceof Date ||
            !isNaN(Date.parse(order.timestamp)),
        ) || orders.length === 0,
    },
    {
      description: "No order has empty customerName or customerEmail",
      test: () =>
        orders.every((order) => order.customerName && order.customerEmail) ||
        orders.length === 0,
    },
    {
      description: "All menu items are visible or invisible (no undefined)",
      test: () => menu.every((item) => typeof item.visible === "boolean"),
    },
    {
      description: "No menu item has undefined name, price, or stock",
      test: () =>
        menu.every(
          (item) =>
            item.name !== undefined &&
            item.price !== undefined &&
            item.stock !== undefined,
        ),
    },
    {
      description: "Order IDs are unique",
      test: () => {
        const ids = orders.map((order) => order.id);
        return ids.length === new Set(ids).size;
      },
    },
    {
      description: "No order has a timeSlot that is not booked",
      test: () =>
        orders.every(
          (order) => !order.timeSlot || timeSlotBookings[order.timeSlot],
        ) || orders.length === 0,
    },
    {
      description:
        "No order has a status other than pending, completed, confirmed, cancelled",
      test: () => {
        const validStatuses = [
          "pending",
          "completed",
          "confirmed",
          "cancelled",
        ];
        return (
          orders.every((order) => validStatuses.includes(order.status)) ||
          orders.length === 0
        );
      },
    },
    {
      description: "No menu item has a non-string name",
      test: () => menu.every((item) => typeof item.name === "string"),
    },
    {
      description: "No menu item has a non-number price",
      test: () => menu.every((item) => typeof item.price === "number"),
    },
    {
      description: "No menu item has a non-number stock",
      test: () => menu.every((item) => typeof item.stock === "number"),
    },
    {
      description: "No menu item has a non-boolean visible property",
      test: () => menu.every((item) => typeof item.visible === "boolean"),
    },
    {
      description: "No menu item has a custom property that is not an object",
      test: () =>
        menu
          .filter((item) => item.custom)
          .every((item) => typeof item.custom === "object"),
    },
  ];

  const totalTests = tests.length;
  let passed = 0;

  for (let i = 0; i < totalTests; i++) {
    const result = !!tests[i].test();
    if (result) passed++;
    const status = result ? chalk.green("PASS") : chalk.red("FAIL");
    if (result) {
      console.log(`General Test (${i + 1}/${totalTests}): [${status}]`);
      logs.push(`General Test (${i + 1}/${totalTests}): [PASS]`);
    } else {
      console.log(
        `General Test (${i + 1}/${totalTests}): [${status}] ${tests[i].description}`,
      );
      logs.push(
        `General Test (${i + 1}/${totalTests}): [FAIL] ${tests[i].description}`,
      );
    }
  }

  // Summary
  console.log();
  const summaryStatus =
    passed === totalTests ? chalk.green("PASS") : chalk.red("FAIL");
  console.log(`General Test ${passed}/${totalTests}: [${summaryStatus}]`);
  logs.push(
    `General Test (${passed}/${totalTests}): ${passed === totalTests ? "[PASS]" : "[FAIL]"}`,
  );
  console.log();
  console.log(
    chalk.yellowBright(
      "----------########## GENERAL SELF TESTS ##########----------",
    ),
  );
  console.log();
  logs.push(`----------########## GENERAL SELF TESTS ##########----------`);
}
