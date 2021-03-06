const express = require("express");
const { Server: HttpServer } = require("http");
const { Server: IOServer } = require("socket.io");
const session = require('express-session');
const { engine } = require("express-handlebars");
const passport = require("passport");
const flash = require("express-flash");
const dotenv = require("dotenv");
const yargs = require("yargs");

const connectDB = require("./config/db");
const initializePassport = require("./config/passport");

const Messages = require("./classes/Messages");
const { faker } = require("@faker-js/faker");
const normalizeMessages = require("./src/normalizeMessages");
const replace = require("./src/loginNameReplaced");

const randomRouter = require("./routes/randomRouter");
const args = yargs(process.argv.slice(2))
    .default({
        port: 8080,
    })
    .alias({
        port: "p",
    }).argv;

const app = express()
const httpServer = new HttpServer(app)
const io = new IOServer(httpServer)

const { isAuthenticated, isNotAuthenticated } = require("./middleware/auth");

dotenv.config();
connectDB(process.env.MONGODB_URI);
initializePassport(passport);

//middleware
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static("./public"))
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: true,
    saveUninitialized: true,
    rolling: true,
    cookie: {
      maxAge: 1000 * 60 * 10,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());
app.use(flash());
app.use(express.static("./public"));
app.use("/api", randomRouter);

//const PORT = process.env.PORT || 8080;
const PORT = args.port || 8080;

app.engine(
    "hbs",
    engine({
        extname: ".hbs",
        defaultLayout: `${__dirname}/views/index.hbs`,
        layoutsDir: `${__dirname}/views/layouts`,
        partialsDir: `${__dirname}/views/partials`,
    })
);

const messagesStore = new Messages();

app.set("views", "./views")
app.set("view engine", "hbs")

const users = []
const products = []

//login & register

app.get("/login", isNotAuthenticated, (_req, res) => {
  res.render("partials/login");
});

app.post("/login", 
  passport.authenticate("login", {
    successRedirect: "/",
    failureRedirect: "/login",
    failureFlash: true,
  })
);

app.get("/", isAuthenticated, async (req, res) => {
  const replacedData = await replace(req.user.email);
  return res.send(replacedData);
});

app.get("/logout", isAuthenticated, (req, res, next) => {
  const email = req.user.email;
  req.logOut((err) => {
      if (err) {
          return next(err);
      }
      return res.render("partials/logout", { email });
  });
});

app.get("/register", isNotAuthenticated, (_req, res) => {
  return res.render("partials/register");
});

app.post(
  "/register",
  passport.authenticate("register", {
      successRedirect: "/",
      failureRedirect: "/register",
      failureFlash: true,
  })
);

app.get("/info", (_req, res) => {
  const data = {
      args: JSON.stringify(args, null, 2),
      os: process.platform,
      nodeVersion: process.version,
      path: process.execPath,
      processId: process.pid,
      folderPath: process.cwd(),
      maxRSS: process.resourceUsage().maxRSS + " bytes",
  };
  return res.render("partials/info", { data: data });
});

//products faker

app.get("/products", async (_req, res) => {
    return res.send(products);
});

const getRandomProducts = (n) => {
  let products = [];
  for (let i = 0; i < n; i++) {
    products.push({
      id: i + 1,
      title: faker.commerce.product(),
      price: faker.commerce.price(),
      thumbnail: faker.image.avatar(),
    });
  }
  return products;
};

app.get("/api/products-test", (_req, res) => {
  const randomProducts = getRandomProducts(5);
  return res.render("partials/products-table", {
      products: randomProducts,
  })
});
  
  io.on("connection", (socket) => {
    console.log(`nuevo usuario id: ${socket.id}`);
  
    //products
    socket.on("addProduct",  (data) => {
      const newProduct = { ...data, id: products.length + 1 }
      products.push(newProduct);
      io.emit("newProduct", newProduct);
    });
  
    //msg
    socket.on("login", async (user) => {
      users.push({
        user,
        id: socket.id,
      });
      const messages = await messagesStore.getAll();
      normalizeMessages(messages);
      socket.emit("success", normalizeMessages(messages));
    });
  
    socket.on("addMessage", async (data) => {
      const newMessage = {
        text: data.message,
        author: data.user,
        time: new Date(),
    }
  
      await messagesStore.saveMessage(newMessage);
      io.emit("newMessage", newMessage);
    });
  });

//conect to port
  
  httpServer.listen(PORT, () =>
    console.log(`Servidor escuchando en puerto ${PORT}`)
  );
