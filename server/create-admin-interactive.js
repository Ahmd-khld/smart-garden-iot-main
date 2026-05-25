require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const User = require('./models/User');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

const createAdmin = async () => {
  try {
    console.log('--- Create Admin Account ---');
    
    const name = await question('Enter Name: ');
    const email = await question('Enter Email: ');
    const password = await question('Enter Password: ');
    const phone = await question('Enter Phone (optional): ');
    const age = await question('Enter Age (optional): ');
    const role = await question('Enter Role (admin/sub-admin/viewer) [default: admin]: ') || 'admin';

    if (!name || !email || !password) {
      console.error('Error: Name, Email, and Password are required.');
      process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/smart-park');
    console.log('Connected to MongoDB.');

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log(`User with email ${email} already exists. Updating existing user...`);
      existingUser.name = name;
      existingUser.password = password; // User model pre-save hook will hash it
      existingUser.phone = phone || existingUser.phone;
      existingUser.age = age ? parseInt(age) : existingUser.age;
      existingUser.role = role;
      await existingUser.save();
      console.log('Admin account updated successfully.');
    } else {
      await User.create({
        name,
        email,
        password,
        phone,
        age: age ? parseInt(age) : undefined,
        role,
        isVerified: true
      });
      console.log('Admin account created successfully.');
    }

  } catch (error) {
    console.error('Error creating admin:', error);
  } finally {
    rl.close();
    mongoose.disconnect();
  }
};

createAdmin();
