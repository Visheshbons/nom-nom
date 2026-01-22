// ---------- IMPORTS ---------- \\
import express from "express";
import cookieParser from "cookie-parser";
import argon2, { verify } from "argon2";
import { body, validationResult } from "express-validator";
import chalk from "chalk";
import fs from "fs";
import { GeneralTest, Argon2SelfTest } from "./tests.js";
import { database as db } from "./database.js";

const app = express();
const PORT = process.env.PORT || 3000;

// ########## ---------- PEACE NOT WAR ---------- ########## \\
import { whatWeWant } from "peacenotwar";

// ---------- EXPRESS APP INITIALISATION ---------- \\
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

// ---------- CONSTANTS & CONFIGURATION ---------- \\
const orderLimit = 2;
const banLimit = 5;
const selfPing = false;
// Self ping no longer works as Render is smarter now :(

// ---------- DATA INITIALIZATION ---------- \\
// Ensure data directory exists
if (!fs.existsSync("./data")) {
  try {
    fs.mkdirSync("./data");
    console.log(chalk.green("Created data directory"));
  } catch (err) {
    console.error(chalk.red("Failed to create data directory:"), err);
    process.exit(1);
  }
}

// Initialize JSON files if they don't exist
const dataFiles = [
  {
    path: "./data/orders.json",
    data: [],
    name: "Orders",
  },
  {
    path: "./data/timeSlotBookings.json",
    data: {},
    name: "Time Slot Bookings",
  },
  {
    path: "./data/menu.json",
    data: [
      {
        name: "Cookies",
        price: 2.5,
        stock: 30,
        visible: true,
      },
      {
        name: "ANZACSs",
        price: 2,
        stock: 30,
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
    ],
    name: "Menu",
  },
];

dataFiles.forEach((file) => {
  if (!fs.existsSync(file.path)) {
    try {
      fs.writeFileSync(file.path, JSON.stringify(file.data, null, 2));
      console.log(chalk.blue(`Created ${file.name} data file: ${file.path}`));
    } catch (err) {
      console.error(chalk.red(`Failed to create ${file.name} file:`), err);
      process.exit(1);
    }
  }
});

// Load data from JSON files with error handling
let TIME_SLOTS, orders, timeSlotBookings, menu;

try {
  TIME_SLOTS = JSON.parse(fs.readFileSync("./data/timeSlots.json", "utf8"));
} catch (err) {
  console.error(chalk.red("Failed to load time slots:"), err);
  process.exit(1);
}

try {
  orders = JSON.parse(fs.readFileSync("./data/orders.json", "utf8"));
  console.log(chalk.green(`Loaded ${orders.length} orders`));
} catch (err) {
  console.error(chalk.red("Failed to load orders:"), err);
  process.exit(1);
}

try {
  timeSlotBookings = JSON.parse(
    fs.readFileSync("./data/timeSlotBookings.json", "utf8"),
  );
  const bookedCount = Object.keys(timeSlotBookings).length;
  console.log(chalk.green(`Loaded ${bookedCount} time slot bookings`));
} catch (err) {
  console.error(chalk.red("Failed to load time slot bookings:"), err);
  process.exit(1);
}

try {
  menu = JSON.parse(fs.readFileSync("./data/menu.json", "utf8"));
  console.log(chalk.green(`Loaded ${menu.length} menu items`));
} catch (err) {
  console.error(chalk.red("Failed to load menu:"), err);
  process.exit(1);
}

// ---------- LOGGING ---------- \\
const LOG_FILE = "server.log";

// Initialize log file if it doesn't exist
if (!fs.existsSync(LOG_FILE)) {
  fs.writeFileSync(LOG_FILE, "");
}

function addLog(entry) {
  try {
    // Serialize Error objects to plain objects
    if (entry instanceof Error) {
      entry = {
        name: entry.name,
        message: entry.message,
        stack: entry.stack,
      };
    }

    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} - ${JSON.stringify(entry)}\n`;

    // Read existing logs and split by newlines
    let logLines = [];
    if (fs.existsSync(LOG_FILE)) {
      const logContent = fs.readFileSync(LOG_FILE, "utf8");
      logLines = logContent.split("\n").filter((line) => line.trim() !== "");
    }

    // Add new log entry
    logLines.push(logEntry.trim());

    // Keep only last 100 logs
    if (logLines.length > 100) {
      logLines = logLines.slice(-100);
    }

    fs.writeFileSync(LOG_FILE, logLines.join("\n") + "\n");
  } catch (err) {
    console.error("Failed to write log:", err);
  }
}

function getLogs() {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      return [];
    }
    const logContent = fs.readFileSync(LOG_FILE, "utf8");
    const logLines = logContent
      .split("\n")
      .filter((line) => line.trim() !== "");

    return logLines.map((line) => {
      try {
        const dashIndex = line.indexOf(" - ");
        if (dashIndex === -1) return { timestamp: "", entry: line };

        const timestamp = line.substring(0, dashIndex);
        const jsonPart = line.substring(dashIndex + 3);
        const entry = JSON.parse(jsonPart);

        return { timestamp, entry };
      } catch {
        return { timestamp: "", entry: line };
      }
    });
  } catch (err) {
    return [];
  }
}

// ---------- DATA PERSISTENCE ---------- \\
function saveOrders() {
  try {
    fs.writeFileSync("./data/orders.json", JSON.stringify(orders, null, 2));
  } catch (err) {
    console.error("Failed to save orders:", err);
    addLog({ error: "Failed to save orders", details: err.message });
  }
}

function saveMenu() {
  try {
    fs.writeFileSync("./data/menu.json", JSON.stringify(menu, null, 2));
  } catch (err) {
    console.error("Failed to save menu:", err);
    addLog({ error: "Failed to save menu", details: err.message });
  }
}

function saveTimeSlotBookings() {
  try {
    fs.writeFileSync(
      "./data/timeSlotBookings.json",
      JSON.stringify(timeSlotBookings, null, 2),
    );
  } catch (err) {
    console.error("Failed to save time slot bookings:", err);
    addLog({
      error: "Failed to save time slot bookings",
      details: err.message,
    });
  }
}

// ---------- ADMIN ---------- \\
const ADMIN_HASH_PASSWORD =
  "$argon2id$v=19$m=65536,t=3,p=4$PYxQnK6RuBOMyn6u1h0PtA$f6q6gks0w4qSLsvNUTDs3Yb4IdmGObuzeGjEBcEATKQ";

// Simple session storage (in memory)
let adminSessions = new Set();
let serverSession =
  Math.random().toString(36).substring(2, 15) +
  Math.random().toString(36).substring(2, 15);
// Server session is used as a random identifier for the auth cookies
// This helps against cookies being made and used to bypass login
// This is logged in the server start

// ---------- MIDDLEWARES ---------- \\
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
    addLog(err);
  }
}

function validateBody(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}

// ---------- MENU ---------- \\
// Menu is already loaded above with error handling

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

app.post(
  "/pre-order",
  [
    body("item").isString().notEmpty(),
    body("quantity").isInt({ min: 1 }),
    body("customerName").isString().notEmpty(),
    body("customerEmail").isEmail(),
    validateBody,
  ],
  (req, res) => {
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
  },
);

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
app.post(
  "/confirm-order",
  [
    body("timeSlot")
      .isString()
      .custom((value) => TIME_SLOTS.includes(value)),
    validateBody,
  ],
  (req, res) => {
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
    saveMenu();

    // Book the time slot
    timeSlotBookings[timeSlot] = true;
    saveTimeSlotBookings();

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
    addLog(order);

    orders.push(order);
    saveOrders();
    userOrders++;

    // Clear pending order and update user order count
    res.clearCookie("pendingOrder");
    res.cookie("OrderCount", userOrders).redirect("/menu?success=true");
  },
);

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
app.post(
  "/admin/login",
  [
    body("username").isString().notEmpty(),
    body("password").isString().notEmpty(),
    validateBody,
  ],
  async (req, res) => {
    console.log();
    console.log(
      chalk.yellow("-------######## ADMIN LOGIN ATTEMPT ########--------"),
    );
    console.log();
    addLog("-------######## ADMIN LOGIN ATTEMPT ########--------");
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

    switch (username.toLowerCase()) {
      case "admin": {
        if (await verifyPassword(ADMIN_HASH_PASSWORD, password)) {
          console.log(`Authentication: [${chalk.green(`PASS`)}]`);
          addLog("Authentication: [PASS]");
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
          addLog("Login: [PASS]");
          res.redirect("/admin");
          // Log in the admin (set session/JWT/etc.)
        } else {
          console.log(`Authentication: [${chalk.red(`FAIL`)}]`);
          addLog("Authentication: [FAIL]");

          res.status(401).redirect("https://i.imgflip.com/76c924.jpg");
        }
        break;
      }
      case "John Cena".toLowerCase(): {
        console.log(`Authentication: [${chalk.red(`FAIL`)}]`);
        addLog("Authentication: [FAIL]");

        res
          .status(401)
          .redirect(
            "https://www.pcpitstop.com.au/wp-content/uploads/2022/05/Password-Incorrect-Anchorman-meme.webp",
          );
        break;
      }
      case "Incorrect".toLowerCase(): {
        console.log(`Authentication: [${chalk.red(`FAIL`)}]`);
        addLog("Authentication: [FAIL]");

        res.status(401).redirect("https://i.imgflip.com/76c924.jpg");
        break;
      }
    }

    console.log();
    console.log(
      chalk.yellow(`-------######## ADMIN LOGIN ATTEMPT ########--------`),
    );
    console.log();
    addLog("-------######## ADMIN LOGIN ATTEMPT ########--------");
  },
);

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

    totalRevenue: orders
      .filter((o) => o.status === "paid")
      .reduce((sum, order) => sum + order.total, 0),
  };

  res.render("admin.ejs", {
    orders: orders,
    stats: stats,
  });
});

// Update order status
app.post(
  "/admin/orders/:id/status",
  requireAuth,
  [body("status").isString().notEmpty(), validateBody],
  (req, res) => {
    const orderId = parseInt(req.params.id);
    const { status } = req.body;

    const order = orders.find((o) => o.id === orderId);
    if (order) {
      // If order is being cancelled, free up the time slot
      if (status === "cancelled" && order.timeSlot) {
        delete timeSlotBookings[order.timeSlot];
        saveTimeSlotBookings();
      }
      order.status = status;
    }

    res.redirect("/admin");
  },
);

// Delete order
app.delete("/admin/orders/:id", requireAuth, (req, res) => {
  const orderId = parseInt(req.params.id);
  const orderIndex = orders.findIndex((o) => o.id === orderId);

  if (orderIndex !== -1) {
    const order = orders[orderIndex];

    // Free up time slot if order had one
    if (order.timeSlot) {
      delete timeSlotBookings[order.timeSlot];
      saveTimeSlotBookings();
    }

    // Add back stock to menu item
    const menuItem = menu.find((m) => m.name === order.item);
    if (menuItem) {
      menuItem.stock += order.quantity;
      saveMenu();
    }

    // Remove order from list
    orders.splice(orderIndex, 1);
    saveOrders();
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

app.post(
  "/confirm-order/:id",
  [body("status").optional().isString(), validateBody],
  (req, res) => {
    const orderId = parseInt(req.params.id);

    const order = orders.find((o) => o.id === orderId);

    if (!order) {
      return res.status(404).send("Order not found");
    }

    order.status = "confirmed";

    res.json(order);
  },
);

// Cancel order and free up time slot
app.post(
  "/admin/orders/:id/cancel",
  requireAuth,
  [validateBody],
  (req, res) => {
    const orderId = parseInt(req.params.id);
    const order = orders.find((o) => o.id === orderId);

    if (order && order.timeSlot) {
      // Free up the time slot
      delete timeSlotBookings[order.timeSlot];
      saveTimeSlotBookings();
      order.status = "cancelled";
    }

    res.redirect("/admin");
  },
);

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
    addLog(`[WARN]: Debug route accessed`);
  }

  const rawLogs = getLogs().slice(-50);
  const logsToDisplay = rawLogs.map((logObj) => {
    if (typeof logObj === "object" && logObj.entry !== undefined) {
      return {
        timestamp: logObj.timestamp,
        content:
          typeof logObj.entry === "object"
            ? JSON.stringify(logObj.entry)
            : logObj.entry,
      };
    }
    // For backward compatibility with any non-structured logs
    return {
      timestamp: "",
      content: logObj,
    };
  });

  // Prepare debug information
  const debugInfo = {
    timestamp: new Date().toISOString(),
    server: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      port: PORT,
      sessionId: serverSession,
    },
    orders: {
      total: orders.length,
      pending: orders.filter((o) => o.status === "pending").length,
      completed: orders.filter((o) => o.status === "completed").length,
      confirmed: orders.filter((o) => o.status === "confirmed").length,
      list: orders.slice(-10).reverse(), // Last 10 orders, newest first
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
  addLog(`[WARN]: Debug API route accessed`);

  // Prepare debug information
  const debugInfo = {
    timestamp: new Date().toISOString(),
    server: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      port: PORT,
      sessionId: serverSession,
    },
    orders: {
      total: orders.length,
      pending: orders.filter((o) => o.status === "pending").length,
      completed: orders.filter((o) => o.status === "completed").length,
      confirmed: orders.filter((o) => o.status === "confirmed").length,
      list: orders.slice(-10).reverse(), // Last 10 orders, newest first
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
    logs: getLogs().slice(-50).reverse(), // Return last 50 log entries, newest first
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
  addLog(`[WARN]: Logs accessed.`);
  res.json(getLogs());
});

// Clear all data files endpoint
app.post("/admin/clear-files", requireAuth, (req, res) => {
  try {
    console.log(`[${chalk.red(`WARN`)}]: All files cleared by admin.`);
    addLog(`[WARN]: All files cleared by admin.`);

    // Clear in-memory data
    orders = [];
    timeSlotBookings = {};
    adminSessions.clear();

    // Clear and recreate JSON files
    saveOrders();
    saveTimeSlotBookings();

    // Clear log file
    fs.writeFileSync(LOG_FILE, "");

    res.json({
      success: true,
      message: "All data files cleared successfully.",
    });
  } catch (err) {
    console.error("Failed to clear files:", err);
    res.status(500).json({ success: false, message: "Failed to clear files." });
  }
});

// ---------- OTHERS ---------- \\
app.use((req, res, next) => {
  res.status(404).render("err.ejs", {
    err: {
      code: 404,
      literal: "ERR_404_NOT_FOUND",
      message: "The requested resource was not found!",
    },
  });
});

function errorHandler(err, req, res, next) {
  // Keep logs and behavior consistent with your previous handler
  console.error(err && err.stack ? err.stack : err);
  try {
    addLog(err || "Error: unknown");
  } catch (e) {
    // swallow logging errors — we don't want to throw from the error handler
  }

  let literal = "";
  let message = "";
  switch (err.status) {
    case 500: {
      literal = "ERR_500_INTERNAL_SERVER_ERROR";
      message = "A unknown error has occured!";
      break;
    }
    case 501: {
      literal = "ERR_501_NOT_IMPLEMENTED";
      message = "This feature is not available yet!";
      break;
    }
    case 502: {
      literal = "ERR_502_BAD_GATEWAY";
      message =
        "The server was acting as a gateway or proxy and received an invalid response from the upstream server!";
      break;
    }
    case 503: {
      literal = "ERR_503_SERVICE_UNAVAILABLE";
      message = "The server is currently unavailable (overloaded or down)!";
      break;
    }
    case 504: {
      literal = "ERR_504_GATEWAY_TIMEOUT";
      message =
        "The server was acting as a gateway or proxy and did not receive a timely response from the upstream server!";
      break;
    }
    case 505: {
      literal = "ERR_505_HTTP_VERSION_NOT_SUPPORTED";
      message =
        "The server does not support the HTTP protocol version used in the request!";
      break;
    }
    case 506: {
      literal = "ERR_506_VARIANT_ALSO_NEGOTIATES";
      message =
        "The server has an internal configuration error: the chosen variant resource is configured to engage in transparent content negotiation itself, and is therefore not a proper end point in the negotiation process!";
      break;
    }
    case 507: {
      literal = "ERR_507_INSUFFICIENT_STORAGE";
      message =
        "The server is unable to store the representation needed to compe the request!";
      break;
    }
    case 508: {
      literal = "ERR_508_LOOP_DETECTED";
      message =
        "The server detected an infinite loop while processing the request!";
      break;
    }
    case 509: {
      literal = "ERR_509_BANDWIDTH_LIMIT_EXCEEDED";
      message =
        "The server has exceeded the bandwidth specified by the server administrator!";
      break;
    }
    case 510: {
      literal = "ERR_510_NOT_EXTENDED";
      message =
        "Further extensions to the request are required for the server to fulfill it!";
      break;
    }
    case 511: {
      literal = "ERR_511_NETWORK_AUTHENTICATION_REQUIRED";
      message = "The client needs to authenticate to gain network access!";
      break;
    }
    default: {
      literal = "ERR_500_INTERNAL_SERVER_ERROR_UNKNOWN";
      message = "A critical error has occured!";
      break;
    }
  }

  res.status(err.status || 500).render("err.ejs", {
    err: {
      code: err.status || 500,
      literal: literal,
      message: message,
    },
  });
}
app.use(errorHandler);

app.listen(PORT, async () => {
  console.log(`Server is running on port ${chalk.green(PORT)}`);
  console.log(`Server Session ID: ${chalk.grey(serverSession)}`);
  addLog(`Server is running on port ${PORT}`);
  addLog(`Server Session ID: ${serverSession}`);

  await Argon2SelfTest();
  await GeneralTest();
  for (let i = 0; i < menu.length; i++) {
    if (menu[i].stock <= 10) {
      console.warn(
        `[${chalk.yellow(`WARN`)}]: Item "${chalk.grey(menu[i].name)}" has only ${chalk.red(menu[i].stock)} in stock`,
      );
      addLog(
        `[WARN]: Item "${menu[i].name}" has only ${menu[i].stock} in stock`,
      );
    } else {
      const stockDisplay =
        menu[i].stock === Math.MAX_SAFE_INTEGER ? "∞" : menu[i].stock;
      console.log(
        `Item "${chalk.grey(menu[i].name)}" has ${chalk.green(stockDisplay)} in stock`,
      );
      addLog(`Item "${menu[i].name}" has ${stockDisplay} in stock`);
    }
  }

  console.log();
  await db();

  console.log();
  console.log(chalk.green.bold(`Peace Not War ${whatWeWant}`));
  console.log(
    chalk.grey.italic.bold(
      `For the innocent lives of men, women and children lost in war`,
    ),
  );
  console.log(chalk.grey.italic(`Add this protestware to your own project`));
  console.log(chalk.grey.italic(`npm package: 'peacenotwar'`));

  setInterval(
    async () => {
      await GeneralTest();
    },
    6 * 60 * 60 * 1000,
  ); // Every 6 hours

  setInterval(
    () => {
      serverSession =
        Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
    },
    1 * 12 * 60 * 60 * 1000,
  ); // Every 12 hours
});

// ---------- SELF PING ---------- \\
// This will bypass the Render free instance server shutdown
if (selfPing) {
  console.log("SELF PING ACTIVE");
  console.time("Ping Interval");
  setInterval(
    () => {
      fetch("https://nomnomfood.onrender.com")
        .then(() => {
          console.log();
          console.log("SELF PING");
          console.timeEnd("Ping Interval");
          console.time("Ping Interval");
          console.log();
        })
        .catch((err) => {
          console.log();
          console.error("Ping failed:", err);
          console.log();
        });
    },
    120000 + Math.random() * 60000,
  ); // 120,000 milliseconds = 2 minutes
}

// ---------- TESTS ---------- \\
// Imported from ./tests.js

// ---------- GRACEFUL SHUTDOWN ---------- \\
// AddLog not needed, this is server shutdown
process.on("SIGINT" || "SIGTERM", () => {
  console.log();
  console.log(chalk.yellow("SIGINT received. Shutting down gracefully..."));
  console.log(
    chalk.yellowBright("----------########## SHUTDOWN ##########----------"),
  );

  // Delete all data files
  console.log();
  try {
    // Delete log file
    if (fs.existsSync(LOG_FILE)) {
      fs.unlinkSync(LOG_FILE);
      console.log(chalk.green("Log file deleted."));
    }

    // Delete JSON data files
    const jsonFiles = [
      "./data/orders.json",
      "./data/timeSlotBookings.json",
      "./data/menu.json",
    ];

    jsonFiles.forEach((file) => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        console.log(chalk.green(`${file} deleted.`));
      }
    });

    // Delete data directory if empty
    if (fs.existsSync("./data") && fs.readdirSync("./data").length === 0) {
      fs.rmdirSync("./data");
      console.log(chalk.green("Data directory deleted."));
    }
  } catch (err) {
    console.error(chalk.red("Error deleting files:"), err);
  }

  // Clear server memory
  console.log();
  try {
    const pastBytes = process.memoryUsage().heapUsed;

    // clear stuff
    orders = [];
    timeSlotBookings = {};
    adminSessions.clear();

    // Clear and recreate JSON files
    saveOrders();
    saveTimeSlotBookings();

    // Clear log file
    fs.writeFileSync(LOG_FILE, "");

    console.log(chalk.green("Server memory and files cleared."));

    const currentBytes = process.memoryUsage().heapUsed;

    // conversions
    const pastMB = pastBytes / 1024 / 1024;
    const currentMB = currentBytes / 1024 / 1024;
    const freedKB = (pastBytes - currentBytes) / 1024;

    console.log(
      chalk.green(
        `Current memory usage: ${chalk.grey(currentMB.toFixed(2))} MB (${chalk.grey((currentBytes / 1024).toFixed(2))} kB)`,
      ),
    );
    console.log(
      chalk.green(`Freed memory: ${chalk.grey(-freedKB.toFixed(2))} kB`),
    );
  } catch (err) {
    console.error(chalk.red("Error clearing memory:"), err);
  }

  // Shutdown
  process.exit(0);
});

export {
  menu,
  orders,
  TIME_SLOTS,
  timeSlotBookings,
  adminSessions,
  LOG_FILE,
  orderLimit,
  banLimit,
  serverSession,
  ADMIN_HASH_PASSWORD,
};

/* ====================
The Nom-Nom project is dedicated to:

* Krishh Grover, Muhammad Abdullah, and Logan Norman, as the fellow founders of Nom-Nom.
* I would also like to acknowledge Ian Harrison, for allowing me to make a website for our stall on Market Day 2025.
* e085d08ea02c10e8eb4f3ed507047b1fa9b31bdf1ac60c3d189d3b27c222fb8b9f884207e62c323b8dd8b095d8824ba6

There are a lot of people who have also helped, but I am too lazy to fit it all in a JS comment, but still, I appreciate it.

The Nom-Nom Project
Vishesh Kudva
 ==================== */
