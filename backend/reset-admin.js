require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./models/User'); // Ensure this points to your User model

const resetSuperAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/smart-park');
    console.log('MongoDB Connected.');

    const email = 'admin@smartpark.com';
    // Use the password passed in the terminal, or fallback to 'admin'
    const password = process.argv[2] || 'admin';
    const hashedPassword = await bcrypt.hash(password, 12);

    const adminUser = await User.findOne({ email });

    if (adminUser) {
      await User.updateOne({ email }, { $set: { password: hashedPassword, role: 'admin' } });
      console.log(`SUCCESS: Super admin ${email} updated with password: "${password}"`);
    } else {
      await User.create({
        name: 'System Administrator',
        email: email,
        phone: 'N/A',
        password: hashedPassword,
        age: 30,
        role: 'admin',
        hasDisability: false
      });
      console.log(`SUCCESS: Super admin ${email} created with password: "${password}"`);
    }
  } catch (error) {
    console.error('Error resetting admin:', error);
  } finally {
    mongoose.disconnect();
  }
};

resetSuperAdmin();