import express from "express";

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

const orderLimit = 2;
const banLimit = 5;

// Store orders in memory (in production, use a database)
let orders = [];

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

app.get("/", (req, res) => {
  res.render("index.ejs", {
    menu: menu,
  });
});

app.get("/menu", (req, res) => {
  res.render("menu.ejs", {
    menu: menu,
    success: req.query.success === "true",
  });
});

app.post("/pre-order", (req, res) => {
  const { item, quantity, customerName, customerEmail } = req.body;

  // Find the menu item
  const menuItem = menu.find((m) => m.name === item);

  if (!menuItem) {
    return res.status(400).send("Invalid menu item");
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

  orders.push(order);

  // Redirect back to menu with success message
  res.redirect("/menu?success=true");
});

app.get("/orders", (req, res) => {
  res.json(orders);
});

app.use((req, res, next) => {
  res.send("ERR_404_NOT_FOUND");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
