import { MongoClient, ServerApiVersion } from "mongodb";
import chalk from "chalk";
import dotenv from "dotenv";
dotenv.config();
const uri = process.env.MONGODB_URI;
if (
  !uri ||
  typeof uri !== "string" ||
  (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://"))
) {
  throw new Error(
    "Missing or invalid MONGODB_URI. Please set MONGODB_URI in your environment or .env file with a valid mongodb:// or mongodb+srv:// connection string.",
  );
}

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  console.log(`MongoDB connection: [${chalk.grey("ESTABLISHING...")}]`);
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(`MongoDB connection: [${chalk.green("CONNECTED")}]`);
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}
// run().catch(console.dir);
// This runs in index.js

export { client, run };
