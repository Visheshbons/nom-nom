import { MongoClient, MongoError, ServerApiVersion } from "mongodb";
import chalk from "chalk";
import dotenv from "dotenv";
import fs from "fs/promises";
import { exit } from "process";

dotenv.config();

let db = null;

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error(chalk.red("MONGODB_URI is not set in environment variables."));
  exit(1);
}

const client = new MongoClient(MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function database() {
  console.log(`MongoDB connection: [${chalk.grey("ESTABLISHING...")}]`);

  try {
    await client.connect();
    db = client.db("nom-nom");

    console.log(`MongoDB: [${chalk.green("CONNECTED")}]`);

    /* =====================
       COLLECTIONS & INDEXES
    ===================== */
    const ordersCollection = db.collection("orders");
    await ordersCollection.createIndex({ id: 1 }, { unique: true });
    await ordersCollection.createIndex({ item: 1 });
    await ordersCollection.createIndex({ customerEmail: 1 });
    await ordersCollection.createIndex({ status: 1 });
    await ordersCollection.createIndex({ timestamp: 1 });
    await ordersCollection.createIndex({ timeSlot: 1 });

    const menuCollection = db.collection("menu");
    await menuCollection.createIndex({ name: 1 }, { unique: true });
    await menuCollection.createIndex({ visible: 1 });
    await menuCollection.createIndex({ price: 1 });
    await menuCollection.createIndex({ stock: 1 });
    await menuCollection.createIndex({ "custom.sauces.choco": 1 });
    await menuCollection.createIndex({ "custom.sauces.caramel": 1 });
    await menuCollection.createIndex({ "custom.sauces.strawberry": 1 });

    const timeSlotsCollection = db.collection("timeSlots");
    await timeSlotsCollection.createIndex({ slot: 1 }, { unique: true });

    const timeSlotBookingsCollection = db.collection("timeSlotBookings");
    await timeSlotBookingsCollection.createIndex({ slot: 1 }, { unique: true });
    await timeSlotBookingsCollection.createIndex({ booked: 1 });

    /* =====================
       SEEDING
    ===================== */
    if ((await menuCollection.countDocuments()) === 0) {
      const menuData = JSON.parse(
        await fs.readFile("./data/menu.json", "utf-8"),
      );
      if (menuData.length > 0) {
        await menuCollection.insertMany(menuData);
        console.log(chalk.cyan("Seeded menu collection"));
      }
    }

    if ((await ordersCollection.countDocuments()) === 0) {
      const ordersData = JSON.parse(
        await fs.readFile("./data/orders.json", "utf-8"),
      );
      if (ordersData.length > 0) {
        await ordersCollection.insertMany(ordersData);
        console.log(chalk.cyan("Seeded orders collection"));
      }
    }

    if ((await timeSlotsCollection.countDocuments()) === 0) {
      const slots = JSON.parse(
        await fs.readFile("./data/timeSlots.json", "utf-8"),
      ).map((slot) => ({ slot }));
      if (slots.length > 0) {
        await timeSlotsCollection.insertMany(slots);
        console.log(chalk.cyan("Seeded timeSlots collection"));
      }
    }

    if ((await timeSlotBookingsCollection.countDocuments()) === 0) {
      const bookingsRaw = JSON.parse(
        await fs.readFile("./data/timeSlotBookings.json", "utf-8"),
      );
      const bookings = Object.entries(bookingsRaw).map(([slot, booked]) => ({
        slot,
        booked,
      }));
      if (bookings.length > 0) {
        await timeSlotBookingsCollection.insertMany(bookings);
        console.log(chalk.cyan("Seeded timeSlotBookings collection"));
      }
    }

    /* =====================
       HELPER FUNCTIONS
    ===================== */

    // ORDERS
    const orders = {
      async add(order) {
        return await ordersCollection.insertOne(order);
      },
      async remove(query) {
        return await ordersCollection.deleteMany(query);
      },
      async update(query, update) {
        return await ordersCollection.updateMany(query, { $set: update });
      },
      async get(query = {}) {
        return await ordersCollection.find(query).toArray();
      },
    };

    // MENU
    const menu = {
      async add(item) {
        return await menuCollection.insertOne(item);
      },
      async remove(query) {
        return await menuCollection.deleteMany(query);
      },
      async update(query, update) {
        return await menuCollection.updateMany(query, { $set: update });
      },
      async get(query = {}) {
        return await menuCollection.find(query).toArray();
      },
    };

    // TIME SLOTS
    const timeSlots = {
      async add(slot) {
        return await timeSlotsCollection.insertOne({ slot });
      },
      async remove(query) {
        return await timeSlotsCollection.deleteMany(query);
      },
      async update(query, update) {
        return await timeSlotsCollection.updateMany(query, { $set: update });
      },
      async get(query = {}) {
        return await timeSlotsCollection.find(query).toArray();
      },
    };

    // TIME SLOT BOOKINGS
    const timeSlotBookings = {
      async add(slot, booked = false) {
        return await timeSlotBookingsCollection.insertOne({ slot, booked });
      },
      async remove(query) {
        return await timeSlotBookingsCollection.deleteMany(query);
      },
      async update(query, update) {
        return await timeSlotBookingsCollection.updateMany(query, {
          $set: update,
        });
      },
      async get(query = {}) {
        return await timeSlotBookingsCollection.find(query).toArray();
      },
    };

    return { orders, menu, timeSlots, timeSlotBookings };
  } catch (err) {
    console.error(chalk.red("A critical MongoDB error occurred"));
    console.error(err);
    throw new MongoError(err);
  }
}

export { client, database };

/* ====================
The Nom-Nom project is dedicated to:

* Krishh Grover, Muhammad Abdullah, and Logan Norman, as the fellow founders of Nom-Nom.
* I would also like to acknowledge Ian Harrison, for allowing me to make a website for our stall on Market Day 2025.
* e085d08ea02c10e8eb4f3ed507047b1fa9b31bdf1ac60c3d189d3b27c222fb8b9f884207e62c323b8dd8b095d8824ba6

There are a lot of people who have also helped, but I am too lazy to fit it all in a JS comment, but still, I appreciate it.

The Nom-Nom Project
Vishesh Kudva
 ==================== */
