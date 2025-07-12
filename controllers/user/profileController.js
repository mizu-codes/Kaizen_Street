const User = require('../../models/userSchema');

const userProfile = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.redirect('/login');
    }

    const userData = await User.findById(userId);
    if (!userData) {
      req.session.destroy();           
      return res.redirect('/login');
    }
    
    res.render('profile', {
      user: userData,
    });
  } catch (error) {
    console.error('Error retrieving profile data:', error);
    return res.redirect('/pageNotFound');
  }
};

module.exports = {
  userProfile,
};
