import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import path from 'path';
require('dotenv').config();
console.log("Checking Keys:");
console.log("Key ID loaded:", process.env.RAZORPAY_KEY_ID ? "Yes" : "NO");
console.log("Secret loaded:", process.env.RAZORPAY_SECRET ? "Yes" : "NO");

// @ts-ignore
const Razorpay = require('razorpay');
import crypto from 'crypto';

const app = express();
const prisma = new PrismaClient();
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });


app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

const SECRET = process.env.JWT_SECRET || 'fallback_secret';

// SIGNUP ROUTE
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password, role, restaurantName, address } = req.body;
    
    // 1. Create the User (Using exact password as requested for testing)
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: password, 
        role: role || 'CUSTOMER',
      },
    });

    // 2. If Restaurant, create the connected Restaurant profile
    if (role === 'RESTAURANT') {
      await prisma.restaurant.create({
        data: {
          ownerId: user.id,
          name: restaurantName || name, // Fallback to user name
          address: address || "Address not provided",
          latitude: 0.0, // Mock data for MVP
          longitude: 0.0, // Mock data for MVP
        }
      });
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, SECRET);
    res.json({ token, role: user.role, name: user.name });
  } catch (error) {
    res.status(400).json({ error: 'Email already exists or invalid data' });
  }
});

// LOGIN ROUTE
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await prisma.user.findUnique({ where: { email } });

    // Comparing exact password (UNSAFE)
    if (!user || password !== user.password) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, SECRET);
    res.json({ token, role: user.role, name: user.name });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// CREATE FOOD LISTING
app.post('/api/food', upload.single('image'), async (req, res) => { // Added upload.single('image')
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token provided' });

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, SECRET) as { userId: string, role: string };

    if (decoded.role !== 'RESTAURANT') {
      return res.status(403).json({ error: 'Only restaurants can list food' });
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { ownerId: decoded.userId }
    });

    if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });
    
    // This now works because of multer
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    console.log("Saving to DB - URL:", imageUrl);
    
    const { title, description, category, originalPrice, discountedPrice, quantity, pickupStart, pickupEnd } = req.body;
    
    const foodListing = await prisma.foodListing.create({
      data: {
        restaurantId: restaurant.id,
        title,
        description: description || "Fresh surplus meal",
        category: category || "General",
        originalPrice: parseFloat(originalPrice),
        discountedPrice: parseFloat(discountedPrice),
        quantity: parseInt(quantity),
        imageUrl: imageUrl,
        pickupStart: new Date(pickupStart),
        pickupEnd: new Date(pickupEnd),
      }
    });
    res.json(foodListing);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create listing' });
  }
});
// GET ALL ACTIVE FOOD LISTINGS (For Users)
app.get('/api/food', async (req, res) => {
  try {
    const listings = await prisma.foodListing.findMany({
      where: {
        isActive: true,
        quantity: { gt: 0 } // Only show food that is currently in stock
      },
      include: {
        restaurant: {
          select: { name: true, address: true } // Include restaurant details for the UI
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(listings);
  } catch (error) {
    console.error("Error fetching feed:", error);
    res.status(500).json({ error: 'Failed to fetch food feed' });
  }
});



// GET ALL ACTIVE FOOD LISTINGS (For Users)


// GET A RESTAURANT'S OWN LISTINGS
app.get('/api/restaurant/food', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token provided' });

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, SECRET) as { userId: string };

    const restaurant = await prisma.restaurant.findUnique({
      where: { ownerId: decoded.userId }
    });

    if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });

    const listings = await prisma.foodListing.findMany({
      where: { restaurantId: restaurant.id },
      orderBy: { createdAt: 'desc' } 
    });

    res.json(listings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
});
// GET RESTAURANT PROFILE
app.get('/api/restaurant/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token' });
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, SECRET) as { userId: string };

    const restaurant = await prisma.restaurant.findUnique({
      where: { ownerId: decoded.userId }
    });
    res.json(restaurant);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// UPDATE RESTAURANT PROFILE
app.put('/api/restaurant/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token' });
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, SECRET) as { userId: string };

    const { name, address } = req.body;
    const updated = await prisma.restaurant.update({
      where: { ownerId: decoded.userId },
      data: { name, address }
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// WEB TEST ROUTE: CLAIM FOOD WITHOUT RAZORPAY
app.post('/api/orders/test', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token' });
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, SECRET) as { userId: string };

    const { foodId, claimQuantity } = req.body;
    const qty = Number(claimQuantity);

    const food = await prisma.foodListing.findUnique({ where: { id: foodId } });
    if (!food || food.quantity < qty) return res.status(400).json({ error: 'Sold out' });

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const [order] = await prisma.$transaction([
      prisma.order.create({
        data: {
          customerId: decoded.userId,
          foodListingId: foodId,
          status: 'PAID', // Auto-set to paid for web testing
          verificationCode: verificationCode,
          quantity: qty,
          totalAmount: Number(food.discountedPrice) * qty
        },
        include: { foodListing: { include: { restaurant: true } } }
      }),
      prisma.foodListing.update({
        where: { id: foodId },
        data: { quantity: food.quantity - qty }
      })
    ]);

    res.json(order);
  } catch (error) {
    res.status(500).json({ error: 'Failed to process test order' });
  }
});

// CREATE ORDER (CLAIM FOOD)
// Replace your existing Razorpay initialization with this:
const key_id = process.env.RAZORPAY_KEY_ID?.trim();
const key_secret = process.env.RAZORPAY_SECRET?.trim();

console.log("DEBUG: Initializing Razorpay with ID:", key_id);
console.log("DEBUG: Initializing Razorpay with Secret length:", key_secret?.length);



const razorpay = new Razorpay({
  key_id: 'rzp_test_SsvL4rc0kH1mdE',
  key_secret: 'cjarnO6RW6CcCX8BowM8a6V1'
});

// 1. Initialize Payment
app.post('/api/payment/init', async (req, res) => {
  try {
    const { amount } = req.body;
    const order = await razorpay.orders.create({
      amount: amount * 100, // Razorpay uses paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}`
    });
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create payment order' });
  }
});

// 2. Verify Payment & Claim Food
app.post('/api/payment/verify', async (req, res) => {
  const { razorpay_payment_id, foodId, claimQuantity } = req.body;

  try {
    // 1. Fetch payment details directly from Razorpay
    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    // 2. Check if the payment status is captured
    if (payment.status === 'captured') {
      // 3. Generate a simple verification code using the last 6 chars of the payment ID
      const verificationCode = "Z-" + payment.id.slice(-6).toUpperCase();
      
      console.log("Payment Verified via API:", payment.id);
      
      // 4. Return success along with the generated code
      return res.status(200).json({ 
        success: true, 
        orderId: payment.id, 
        verificationCode: verificationCode 
      });
    } else {
      return res.status(400).json({ error: 'Payment not captured' });
    }
  } catch (error) {
    console.error("Verification failed:", error);
    return res.status(500).json({ error: 'Verification failed' });
  }
});

// GET RESTAURANT ORDERS (PRODUCTION VERSION)
// GET RESTAURANT ORDERS (PRODUCTION VERSION - FIXED)
app.get('/api/restaurant/orders', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token' });
    
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, SECRET) as { userId: string };

    // 1. Find the actual Restaurant profile connected to this User
    const restaurant = await prisma.restaurant.findUnique({
      where: { ownerId: decoded.userId }
    });

    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurant profile not found' });
    }

    // 2. Fetch orders linked to this specific Restaurant ID
    const restaurantOrders = await prisma.order.findMany({
      where: {
        foodListing: {
          restaurantId: restaurant.id // Fixed: Using Restaurant ID instead of User ID
        }
      },
      include: {
        foodListing: true,
        customer: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(restaurantOrders);
  } catch (error) {
    console.error("Fetch Error:", error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// MARK ORDER AS COMPLETED
app.put('/api/restaurant/orders/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.order.update({
      where: { id },
      data: { status: 'COMPLETED' }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to complete order' });
  }
});

// GET USER ORDER HISTORY


// GET USER ORDER HISTORY
app.get('/api/user/orders', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token' });
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, SECRET) as { userId: string };

    const orders = await prisma.order.findMany({
      where: { customerId: decoded.userId },
      include: { 
        foodListing: { 
          include: { restaurant: { select: { name: true } } } 
        } 
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});


// UPDATE USER PROFILE
app.put('/api/user/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token' });
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, SECRET) as { userId: string };

    const { name } = req.body;
    
    // DEBUG: Print what the server received
    console.log("Updating User ID:", decoded.userId, "with Name:", name);

    const updated = await prisma.user.update({
      where: { id: decoded.userId },
      data: { name }
    });
    
    res.json(updated);
  } catch (error) {
    // CRITICAL: Log the full error to your backend terminal
    console.error("FULL BACKEND ERROR:", error); 
    res.status(500).json({ error: 'Failed to update profile' });
  }
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});