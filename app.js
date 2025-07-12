const express = require('express');
const app = express();
const path = require('path');
const loadUserData = require('./middlewares/userMiddleware');
const userRouter = require('./routes/userRouter');
const adminRouter = require('./routes/adminRouter');
const env = require('dotenv').config();
const session = require('express-session');
const flash   = require('connect-flash'); 
const passport=require('./config/passport');
const db = require('./config/db')
db()

app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

app.use((req, res, next) => {
    res.set('cache-control', 'no-store')
    next();
})
app.use(session({
       secret: process.env.SESSION_SECRET || 'mySecret',
    resave: false,
    saveUninitialized:true,
    cookie:{
        secure: false,
        httpOnly: true,
        maxAge:72*60*60*1000
    }
}))

app.use(flash());

app.use(passport.initialize());
app.use(passport.session());

app.use(loadUserData);

app.set('view engine','ejs')
app.set('views',[path.join(__dirname,'views/user'),path.join(__dirname,'views/admin')])
app.use(express.static(path.join(__dirname, 'public')));

app.use('/',userRouter);
app.use('/admin',adminRouter);

app.use('/admin/products', adminRouter);

app.put('/products/:id', (req, res) => {
    console.log('Request body:', req.body);
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    console.error('Request body too large:', err);
    return res.status(413).send('Payload too large. Try a smaller image.');
  }
  next(err);
});

app.get('/signup', (req, res) => {
  res.render('signup');
});

app.get('/login', (req, res) => {
  res.render('login'); 
});

app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});

const PORT=3000 || process.env.PORT;
app.listen(PORT,()=>{
console.log(`server running on ${PORT}`)
})

module.exports = app;