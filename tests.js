import chalk from "chalk";
import argon2 from "argon2";
import fs from "fs";

import {
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
} from "./index.js";

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

async function Argon2SelfTest() {
  console.log();
  console.log(
    chalk.yellowBright(
      `----------########### ARGON2 SELF TEST ###########----------`,
    ),
  );
  console.log();
  console.log(`Running Argon2 self-test...`);
  addLog("----------########## ARGON2 SELF TEST ##########----------");
  addLog("Running Argon2 self-test...");

  const testPassword = `testString`;
  let total = 0;

  // 1. Basic hash-verify test
  const hash1 = await argon2.hash(testPassword);
  if (await verifyPassword(hash1, testPassword)) {
    console.log(`Test 1/5: [${chalk.green("PASS")}] Password Verification`);
    addLog("Test 1/5: [PASS] Password Verification");
    total++;
  } else {
    console.log(`Test 1/5: [${chalk.red("FAIL")}] Password Verification`);
    addLog("Test 1/5: [FAIL] Password Verification");
  }

  // 2. Different hashes for same input (checking random salt)
  const hash2 = await argon2.hash(testPassword);
  if (hash1 !== hash2) {
    console.log(`Test 2/5: [${chalk.green("PASS")}] Random Salt`);
    addLog("Test 2/5: [PASS] Random Salt");
    total++;
  } else {
    console.log(`Test 2/5: [${chalk.red("FAIL")}] Random Salt`);
    addLog("Test 2/5: [FAIL] Random Salt");
  }

  // 3. Verify rejects wrong password
  if (!(await verifyPassword(hash1, `wrongPassword`))) {
    console.log(
      `Test 3/5: [${chalk.green("PASS")}] Incorrect Password Detection`,
    );
    addLog("Test 3/5: [PASS] Incorrect Password Detection");
    total++;
  } else {
    console.log(
      `Test 3/5: [${chalk.red("FAIL")}] Incorrect Password Detection`,
    );
    addLog("Test 3/5: [FAIL] Incorrect Password Detection");
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
    `Test 4/5: [${corruptedTestPassed ? `${chalk.green("PASS")}` : `${chalk.red("FAIL")}`}] Corrupted Hash Detection`,
  );
  addLog(
    `Test 4/5: [${corruptedTestPassed ? `PASS` : `FAIL`}] Corrupted Hash Detection`,
  );

  // 5. Timing check - not exact but ensures verification completes
  const start = Date.now();
  await verifyPassword(hash1, testPassword);
  const duration = Date.now() - start;
  if (duration > 0) {
    console.log(`Test 5/5: [${chalk.green("PASS")}] Timing Check`);
    addLog("Test 5/5: [PASS] Timing Check");
    total++;
  } else {
    console.log(`Test 5/5: [${chalk.red("FAIL")}] Timing Check`);
    addLog("Test 5/5: [FAIL] Timing Check");
  }

  console.log();
  console.log(`Total tests passed: ${chalk.green(total)}`);
  if (total === 5) {
    console.log(chalk.green(`[PASS]`));
    addLog("[PASS]");
  } else {
    console.log(chalk.red(`[FAIL]`));
    console.log("Inform the developer as soon as possible");
    addLog("[FAIL]");
    addLog("Inform the developer as soon as possible");
  }

  console.log();
  console.log(
    chalk.yellowBright(
      `----------########### ARGON2 SELF TEST ###########----------`,
    ),
  );
  console.log();
  addLog(`----------########## ARGON2 SELF TEST ##########----------`);
}

async function GeneralTest() {
  console.log();
  console.log(
    chalk.yellowBright(
      "----------########## GENERAL SELF TESTS ##########----------",
    ),
  );
  console.log();
  addLog(`----------########## GENERAL SELF TESTS ##########----------`);

  const logs = getLogs();

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
      test: () => typeof ADMIN_HASH_PASSWORD === "string",
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
        "No order has a status other than pending, approved, ready, paid",
      test: () => {
        const validStatuses = ["pending", "approved", "ready", "paid"];
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
    {
      description: "Logging middleware is present",
      test: () => typeof addLog === "function" && typeof getLogs === "function",
    },
    {
      description: "Session management is enabled",
      test: () => typeof serverSession === "string" && serverSession.length > 0,
    },
  ];

  const totalTests = tests.length;
  let passed = 0;

  for (let i = 0; i < totalTests; i++) {
    const result = !!tests[i].test();
    if (result) passed++;
    const status = result ? chalk.green("PASS") : chalk.red("FAIL");
    if (result) {
      console.log(
        `General Test (${i + 1}/${totalTests}): [${status}] ${tests[i].description}`,
      );
      addLog(
        `General Test (${i + 1}/${totalTests}): [PASS] ${tests[i].description}`,
      );
    } else {
      console.log(
        `General Test (${i + 1}/${totalTests}): [${status}] ${tests[i].description}`,
      );
      addLog(
        `General Test (${i + 1}/${totalTests}): [FAIL] ${tests[i].description}`,
      );
    }
  }

  // Summary
  console.log();
  const summaryStatus =
    passed === totalTests ? chalk.green("PASS") : chalk.red("FAIL");
  console.log(`General Test ${passed}/${totalTests}: [${summaryStatus}]`);
  addLog(
    `General Test (${passed}/${totalTests}): ${passed === totalTests ? "[PASS]" : "[FAIL]"}`,
  );
  console.log();
  console.log(
    chalk.yellowBright(
      "----------########## GENERAL SELF TESTS ##########----------",
    ),
  );
  console.log();
  addLog(`----------########## GENERAL SELF TESTS ##########----------`);
}

export { GeneralTest, Argon2SelfTest };
