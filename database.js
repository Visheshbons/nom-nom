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
       OPTIONAL SEEDING
    ===================== */
    if ((await menuCollection.countDocuments()) === 0) {
      const menuData = JSON.parse(await fs.readFile("./menu.json", "utf-8"));
      await menuCollection.insertMany(menuData);
      console.log(chalk.cyan("Seeded menu collection"));
    }

    if ((await ordersCollection.countDocuments()) === 0) {
      const ordersData = JSON.parse(
        await fs.readFile("./orders.json", "utf-8"),
      );
      await ordersCollection.insertMany(ordersData);
      console.log(chalk.cyan("Seeded orders collection"));
    }

    if ((await timeSlotsCollection.countDocuments()) === 0) {
      const slots = JSON.parse(
        await fs.readFile("./timeSlots.json", "utf-8"),
      ).map((slot) => ({ slot }));
      await timeSlotsCollection.insertMany(slots);
      console.log(chalk.cyan("Seeded timeSlots collection"));
    }

    if ((await timeSlotBookingsCollection.countDocuments()) === 0) {
      const bookingsRaw = JSON.parse(
        await fs.readFile("./timeSlotBookings.json", "utf-8"),
      );
      const bookings = Object.entries(bookingsRaw).map(([slot, booked]) => ({
        slot,
        booked,
      }));
      await timeSlotBookingsCollection.insertMany(bookings);
      console.log(chalk.cyan("Seeded timeSlotBookings collection"));
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
