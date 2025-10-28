const express = require('express');
const app = express();
const path = require('path');
const MongoStore = require('connect-mongo');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const loadUserData = require('./middlewares/userMiddleware');
const userRouter = require('./routes/userRouter');
const googleRouter = require('./routes/googleRouter');
const adminRouter = require('./routes/adminRouter');
const Cart = require('./models/cartSchema');
const Wishlist = require('./models/wishlistSchema');
require('dotenv').config();
const session = require('express-session');
const flash = require('connect-flash');
const passport = require('./config/passport');
const db = require('./config/db');
db()

// app.use(helmet({
//   contentSecurityPolicy: false,
// }))

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  message: 'Too many login attempts, please try again later.'
});
app.use('/login', authLimiter);
app.use('/signup', authLimiter);


app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.use(cookieParser(process.env.SESSION_SECRET));

app.use((req, res, next) => {
  res.set('cache-control', 'no-store')
  next();
})

app.use(session({
  name: 'kaizen.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 72 * 60 * 60 * 1000,
    sameSite: 'strict'
  }
}))

app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
app.use(loadUserData);


app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});


app.use(async (req, res, next) => {
  let count = 0;
  try {
    if (req.session && req.session.userId) {
      const cart = await Cart.findOne({ userId: req.session.userId });
      if (cart) {
        count = cart.items.reduce((sum, item) => sum + item.quantity, 0);
      }
    }
  } catch (err) {
    console.error('Cart middleware error:', err);
  }
  res.locals.cartItemCount = count;
  next();
});

app.use(async (req, res, next) => {
  let count = 0;
  try {
    if (req.session && req.session.userId) {
      const wishlist = await Wishlist.findOne({ userId: req.session.userId });
      if (wishlist) {
        count = wishlist.items.length;
      }
    }
  } catch (err) {
    console.error('Wishlist middleware error:', err);
  }
  res.locals.wishlistItemCount = count;
  next();
});


app.set('view engine', 'ejs')
app.set('views', [path.join(__dirname, 'views/user'), path.join(__dirname, 'views/admin')])
app.use(express.static(path.join(__dirname, 'public')));


app.use('/', googleRouter);
app.use('/', userRouter);
app.use('/admin', adminRouter);

app.use((req, res, next) => {
  res.status(404).render('page-404', { message: 'Page not found' });
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    console.error('Request body too large:', err);
    return res.status(413).send('Payload too large. Try a smaller image.');
  }
  console.error('Error:', err);

  if (res.headersSent) return next(err);

  if (process.env.NODE_ENV === 'production') {
    res.status(err.status || 500).send('Something went wrong. Please try again later.');
  } else {
    res.status(err.status || 500).send(err.message || 'Internal Server Error');
  }
});


const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`server running on ${PORT}`);
});


process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, closing server gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = app;