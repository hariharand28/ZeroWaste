import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import {
  verifyToken,
  requireRole,
} from "../middleware/auth.middleware";
import { Role } from "@prisma/client";

export const restaurantRouter = Router();

// All routes below require a valid JWT
restaurantRouter.use(verifyToken);

// ── POST /api/restaurants/listings ───────────────────────────────────────────
// Create a food listing (RESTAURANT role only)
restaurantRouter.post(
  "/listings",
  requireRole(Role.RESTAURANT),
  async (req: Request, res: Response): Promise<void> => {
    const {
      title,
      description,
      category,
      originalPrice,
      discountedPrice,
      quantity,
      pickupStart,
      pickupEnd,
      imageUrl,
    } = req.body;

    // Basic validation
    if (
      !title?.trim() ||
      !category?.trim() ||
      originalPrice == null ||
      discountedPrice == null ||
      quantity == null ||
      !pickupStart ||
      !pickupEnd
    ) {
      res.status(400).json({
        success: false,
        message:
          "title, category, originalPrice, discountedPrice, quantity, pickupStart, and pickupEnd are required.",
      });
      return;
    }

    if (discountedPrice >= originalPrice) {
      res.status(400).json({
        success: false,
        message: "discountedPrice must be less than originalPrice.",
      });
      return;
    }

    if (new Date(pickupEnd) <= new Date(pickupStart)) {
      res.status(400).json({
        success: false,
        message: "pickupEnd must be after pickupStart.",
      });
      return;
    }

    // Fetch the restaurant owned by the authenticated user
    const restaurant = await prisma.restaurant.findUnique({
      where: { ownerId: req.user!.userId },
    });

    if (!restaurant) {
      res.status(404).json({
        success: false,
        message: "Restaurant profile not found for this account.",
      });
      return;
    }

    const listing = await prisma.foodListing.create({
      data: {
        restaurantId: restaurant.id,
        title: title.trim(),
        description: description?.trim() ?? null,
        category: category.trim(),
        originalPrice: parseFloat(originalPrice),
        discountedPrice: parseFloat(discountedPrice),
        quantity: parseInt(quantity, 10),
        pickupStart: new Date(pickupStart),
        pickupEnd: new Date(pickupEnd),
        imageUrl: imageUrl ?? null,
      },
    });

    res.status(201).json({ success: true, listing });
  }
);

// ── GET /api/restaurants/:restaurantId/listings ───────────────────────────────
// Get all active listings for a specific restaurant
restaurantRouter.get(
  "/:restaurantId/listings",
  async (req: Request, res: Response): Promise<void> => {
    const { restaurantId } = req.params;

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      res
        .status(404)
        .json({ success: false, message: "Restaurant not found." });
      return;
    }

    const listings = await prisma.foodListing.findMany({
      where: {
        restaurantId,
        isActive: true,
        pickupEnd: { gte: new Date() }, // only future/ongoing pickups
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, count: listings.length, listings });
  }
);

// ── PATCH /api/restaurants/listings/:listingId/quantity ──────────────────────
// Update the quantity of a listing (RESTAURANT role only, must be owner)
restaurantRouter.patch(
  "/listings/:listingId/quantity",
  requireRole(Role.RESTAURANT),
  async (req: Request, res: Response): Promise<void> => {
    const { listingId } = req.params;
    const { quantity } = req.body;

    if (quantity == null || parseInt(quantity, 10) < 0) {
      res.status(400).json({
        success: false,
        message: "quantity must be a non-negative integer.",
      });
      return;
    }

    // Verify ownership
    const listing = await prisma.foodListing.findUnique({
      where: { id: listingId },
      include: { restaurant: { select: { ownerId: true } } },
    });

    if (!listing) {
      res.status(404).json({ success: false, message: "Listing not found." });
      return;
    }

    if (listing.restaurant.ownerId !== req.user!.userId) {
      res.status(403).json({
        success: false,
        message: "You do not own this listing.",
      });
      return;
    }

    const updated = await prisma.foodListing.update({
      where: { id: listingId },
      data: { quantity: parseInt(quantity, 10) },
    });

    res.json({ success: true, listing: updated });
  }
);

// ── DELETE /api/restaurants/listings/:listingId ───────────────────────────────
// Soft-delete a listing (RESTAURANT role only, must be owner)
restaurantRouter.delete(
  "/listings/:listingId",
  requireRole(Role.RESTAURANT),
  async (req: Request, res: Response): Promise<void> => {
    const { listingId } = req.params;

    // Verify ownership
    const listing = await prisma.foodListing.findUnique({
      where: { id: listingId },
      include: { restaurant: { select: { ownerId: true } } },
    });

    if (!listing) {
      res.status(404).json({ success: false, message: "Listing not found." });
      return;
    }

    if (listing.restaurant.ownerId !== req.user!.userId) {
      res.status(403).json({
        success: false,
        message: "You do not own this listing.",
      });
      return;
    }

    // Soft delete — keeps booking history intact
    await prisma.foodListing.update({
      where: { id: listingId },
      data: { isActive: false },
    });

    res.json({ success: true, message: "Listing deactivated successfully." });
  }
);