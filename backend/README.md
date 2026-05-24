# ZeroWaste 🍃

ZeroWaste is a mobile platform designed to reduce food waste by allowing restaurants to list surplus meals at discounted prices for user pickup.

## Features
* **Restaurant Dashboard:** Manage live inventory, publish listings, and track revenue.
* **Order Management:** Real-time incoming order tracking and status updates.
* **Secure Payments:** Integrated with Razorpay for seamless transactions.
* **Verification System:** Unique verification codes for secure food pickup.

## Tech Stack
* **Frontend:** React Native (Expo), NativeWind (Tailwind CSS)
* **Backend:** Node.js, Express.js
* **Database:** PostgreSQL (via Prisma ORM)
* **Payments:** Razorpay API
* **File Handling:** Expo File System / Multer

## Local Setup
1. Clone the repository.
2. Run `npm install` in both `/frontend` and `/backend` directories.
3. Configure the `.env` files with your local IP (`EXPO_PUBLIC_API_URL`) and Razorpay keys.
4. Start the backend: `npm run dev` (or `npx ts-node src/index.ts`).
5. Start the frontend: `npx expo start -c --dev-client`.