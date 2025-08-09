const User = require('../../models/userSchema');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');


const pageError = async (req, res) => {
    res.render('admin-error');
}

const loadLogin = (req, res) => {
    if (req.session.admin) {
        return res.redirect('/admin')
    }
    return res.render('admin-login', {
        error: null, errors: {}
    })
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const admin = await User.findOne({ email, isAdmin: true });
        if (!admin) {
            return res.render('admin-login', { message: 'No such admin.' });
        }

        const passwordMatch = await bcrypt.compare(password, admin.password);
        if (!passwordMatch) {
            return res.render('admin-login', { message: 'Wrong password.' });
        }

         req.session.admin = admin._id;
        res.redirect('/admin');
    } catch (err) {
        console.error('login error', err);
        res.render('admin-login', { message: 'Something went wrong.' });
    }
};

const loadDashboard = (req, res) => {
    if (!req.session.admin) {
        return res.redirect('/admin/login');
    }

    res.render('admin-dashboard', {
        adminName: req.session.adminName || 'Admin'
    });
};


const logout = (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Logout error:', err);
            res.clearCookie('connect.sid');
            return res.redirect('/admin/login');
        }
        res.clearCookie('connect.sid');
        res.redirect('/admin/login');
    });
};


module.exports = {
    loadLogin,
    login,
    loadDashboard,
    pageError,
    logout
}