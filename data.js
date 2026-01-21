import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import chalk from "chalk";
import fs from "fs/promises";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error(chalk.red("MONGODB_URI is not set in environment variables."));
  throw new Error("MONGODB_URI not provided");
}

const client = new MongoClient(MONGODB_URI);

let db = null;
