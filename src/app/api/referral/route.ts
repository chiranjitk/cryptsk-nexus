import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { auditLog } from "@/lib/services/audit-service";

// ─── GET: Return referral/loyalty data from real database ─
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const search = searchParams.get("search") || "";

  try {
    switch (type) {
      // ── Referral Settings ──
      case "referral_settings": {
        const settings = await db.referralSetting.findUnique({ where: { id: "default" } });
        return NextResponse.json({ settings: settings ?? null });
      }

      // ── Referral Codes (with subscriber info) ──
      case "referral_codes": {
        const codes = await db.referralCode.findMany({
          include: {
            Subscriber: { select: { id: true, name: true, code: true, phone: true } },
          },
          orderBy: { createdAt: "desc" },
        });
        return NextResponse.json({
          codes: codes.map((c) => ({
            id: c.id,
            subscriberId: c.subscriberId,
            subscriberName: c.Subscriber?.name || "Unknown",
            code: c.code,
            totalReferred: c.totalReferred,
            convertedCount: c.convertedCount,
            totalEarned: c.totalEarned,
            status: c.status,
            createdAt: c.createdAt,
          })),
        });
      }

      // ── Referral Tracking ──
      case "referral_tracking": {
        const where = search
          ? {
              OR: [
                { refereePhone: { contains: search } },
                { referrer: { name: { contains: search } } },
                { referee: { name: { contains: search } } },
              ],
            }
          : {};

        const tracking = await db.referralTracking.findMany({
          where,
          include: {
            referrer: { select: { id: true, name: true } },
            referee: { select: { id: true, name: true, phone: true } },
          },
          orderBy: { createdAt: "desc" },
        });
        return NextResponse.json({
          tracking: tracking.map((t) => ({
            id: t.id,
            referrerId: t.referrerId,
            referrerName: t.referrer?.name || "Unknown",
            refereeId: t.refereeId,
            refereeName: t.referee?.name || t.refereePhone,
            refereePhone: t.refereePhone,
            bonusAmount: t.bonusAmount,
            status: t.status,
            referralDate: t.createdAt,
            conversionDate: t.convertedAt,
            expiresAt: t.expiresAt,
          })),
        });
      }

      // ── Loyalty Settings ──
      case "loyalty_settings": {
        const settings = await db.loyaltySetting.findUnique({ where: { id: "default" } });
        return NextResponse.json({ settings: settings ?? null });
      }

      // ── Loyalty Members ──
      case "loyalty_members": {
        const members = await db.loyaltyMember.findMany({
          include: {
            Subscriber: { select: { id: true, name: true, code: true, phone: true } },
          },
          orderBy: { availablePoints: "desc" },
        });
        return NextResponse.json({
          members: members.map((m) => ({
            id: m.id,
            subscriberId: m.subscriberId,
            subscriberName: m.Subscriber?.name || "Unknown",
            totalPoints: m.totalPoints,
            earnedMonth: m.earnedMonth,
            redeemed: m.redeemedPoints,
            availableBalance: m.availablePoints,
            tier: m.tier,
            createdAt: m.createdAt,
          })),
        });
      }

      // ── Points History (with member/subscriber info) ──
      case "points_history": {
        const history = await db.pointsHistory.findMany({
          include: {
            member: {
              select: {
                id: true,
                subscriberId: true,
                Subscriber: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        });
        return NextResponse.json({
          history: history.map((h) => ({
            id: h.id,
            memberId: h.memberId,
            subscriber: h.member?.Subscriber?.name || "Unknown",
            action: h.actionType,
            points: h.points,
            balanceAfter: h.balanceAfter,
            description: h.description,
            date: h.createdAt,
          })),
        });
      }

      // ── Rewards ──
      case "rewards": {
        const rewards = await db.reward.findMany({ orderBy: { createdAt: "desc" } });
        return NextResponse.json({
          rewards: rewards.map((r) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            type: r.type,
            value: r.value,
            pointsRequired: r.pointsRequired,
            active: r.enabled,
            createdAt: r.createdAt,
          })),
        });
      }

      // ── Redemptions ──
      case "redemptions": {
        const redemptions = await db.rewardRedemption.findMany({
          include: {
            member: {
              select: {
                Subscriber: { select: { name: true } },
              },
            },
            reward: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
        });
        return NextResponse.json({
          redemptions: redemptions.map((r) => ({
            id: r.id,
            memberId: r.memberId,
            subscriber: r.member?.Subscriber?.name || "Unknown",
            rewardId: r.rewardId,
            rewardName: r.reward?.name || "Unknown",
            pointsUsed: r.pointsUsed,
            status: r.status,
            date: r.createdAt,
          })),
        });
      }

      // ── Referral Campaigns ──
      case "campaigns": {
        const campaigns = await db.referralCampaign.findMany({
          orderBy: { createdAt: "desc" },
        });
        return NextResponse.json({ campaigns });
      }

      // ── Points Expiry ──
      case "points_expiry": {
        const settings = await db.ispSettings.findUnique({ where: { id: "default" } });
        const expiryDays = settings?.pointsExpiryDays ?? 365;
        const autoExpiry = settings?.pointsAutoExpiry ?? false;
        const expiringThreshold = new Date();
        expiringThreshold.setDate(expiringThreshold.getDate() + 30);

        // Count points entries in the last `expiryDays` that are approaching expiry
        const recentHistory = await db.pointsHistory.findMany({
          where: {
            createdAt: { lte: expiringThreshold },
          },
          include: {
            member: {
              select: {
                Subscriber: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        });

        return NextResponse.json({
          settings: { expiryDays, autoExpiry },
          expiringSoonCount: recentHistory.length,
          expiringSoon: recentHistory.slice(0, 10).map((h) => ({
            id: h.id,
            subscriber: h.member?.Subscriber?.name || "Unknown",
            points: h.points,
            date: h.createdAt,
          })),
        });
      }

      // ── Default: aggregate stats ──
      default: {
        const [totalTracking, convertedTracking, activeMembers, totalRedemptions] = await Promise.all([
          db.referralTracking.count(),
          db.referralTracking.count({ where: { status: "converted" } }),
          db.loyaltyMember.count(),
          db.rewardRedemption.count(),
        ]);
        return NextResponse.json({
          stats: {
            totalReferrals: totalTracking,
            convertedReferrals: convertedTracking,
            activeLoyaltyMembers: activeMembers,
            rewardsRedeemed: totalRedemptions,
          },
        });
      }
    }
  } catch (error) {
    console.error("Referral API GET error:", error);
    return NextResponse.json({ error: "Failed to fetch referral data" }, { status: 500 });
  }
}

// ─── POST: Create/update referral settings, loyalty settings, rewards, campaigns ──
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      // ── Save Referral Settings (upsert) ──
      case "save_referral_settings": {
        const settings = await db.referralSetting.upsert({
          where: { id: "default" },
          update: {
            referrerBonus: body.referrerBonus ?? 100,
            refereeBonus: body.refereeBonus ?? 50,
            validityDays: body.validityDays ?? 90,
            minInvoiceAmount: body.minInvoiceAmount ?? 0,
            enabled: body.enabled ?? true,
          },
          create: {
            id: "default",
            referrerBonus: body.referrerBonus ?? 100,
            refereeBonus: body.refereeBonus ?? 50,
            validityDays: body.validityDays ?? 90,
            minInvoiceAmount: body.minInvoiceAmount ?? 0,
            enabled: body.enabled ?? true,
          },
        });
        return NextResponse.json({ success: true, message: "Referral program settings saved", settings });
      }

      // ── Save Loyalty Settings (upsert) ──
      case "save_loyalty_settings": {
        const settings = await db.loyaltySetting.upsert({
          where: { id: "default" },
          update: {
            pointsPerHundred: body.pointsPerHundred ?? 1,
            pointValueInr: body.pointValueInr ?? 0.5,
            monthlyBonusPoints: body.monthlyBonusPoints ?? 0,
            enabled: body.enabled ?? true,
          },
          create: {
            id: "default",
            pointsPerHundred: body.pointsPerHundred ?? 1,
            pointValueInr: body.pointValueInr ?? 0.5,
            monthlyBonusPoints: body.monthlyBonusPoints ?? 0,
            enabled: body.enabled ?? true,
          },
        });
        return NextResponse.json({ success: true, message: "Loyalty program settings saved", settings });
      }

      // ── Save Points Expiry Settings ──
      case "save_points_expiry": {
        const { expiryDays, autoExpiry } = body;
        await db.ispSettings.update({
          where: { id: "default" },
          data: {
            pointsExpiryDays: expiryDays ?? 365,
            pointsAutoExpiry: autoExpiry ?? false,
          },
        });
        return NextResponse.json({ success: true, message: "Points expiry settings saved" });
      }

      // ── Create Reward ──
      case "create_reward": {
        if (!body.name || !body.pointsRequired) {
          return NextResponse.json({ error: "Name and points required" }, { status: 400 });
        }
        const reward = await db.reward.create({
          data: {
            name: body.name,
            description: body.description || "",
            pointsRequired: Number(body.pointsRequired),
            type: body.type || "DISCOUNT",
            value: body.value ? Number(body.value) : 0,
            enabled: body.active !== false,
          },
        });
        return NextResponse.json({ success: true, reward });
      }

      // ── Redeem Reward ──
      case "redeem_reward": {
        if (!body.rewardId || !body.memberId) {
          return NextResponse.json({ error: "Reward ID and member ID required" }, { status: 400 });
        }

        const [member, reward] = await Promise.all([
          db.loyaltyMember.findUnique({ where: { id: body.memberId } }),
          db.reward.findUnique({ where: { id: body.rewardId } }),
        ]);

        if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });
        if (!reward) return NextResponse.json({ error: "Reward not found" }, { status: 404 });
        if (member.availablePoints < reward.pointsRequired) {
          return NextResponse.json({ error: "Insufficient points" }, { status: 400 });
        }

        const [redemption] = await db.$transaction([
          db.rewardRedemption.create({
            data: {
              memberId: member.id,
              rewardId: reward.id,
              pointsUsed: reward.pointsRequired,
              status: "PENDING",
            },
          }),
          db.loyaltyMember.update({
            where: { id: member.id },
            data: {
              availablePoints: { decrement: reward.pointsRequired },
              redeemedPoints: { increment: reward.pointsRequired },
            },
          }),
          db.pointsHistory.create({
            data: {
              memberId: member.id,
              actionType: "Redeemed",
              points: -reward.pointsRequired,
              balanceAfter: member.availablePoints - reward.pointsRequired,
              description: `Redeemed: ${reward.name}`,
            },
          }),
        ]);

        return NextResponse.json({ success: true, redemption });
      }

      // ── Adjust Points ──
      case "adjust_points": {
        if (!body.memberId || !body.points) {
          return NextResponse.json({ error: "Member ID and points required" }, { status: 400 });
        }

        const points = Number(body.points);
        const member = await db.loyaltyMember.findUnique({ where: { id: body.memberId } });

        if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

        const newBalance = member.availablePoints + points;
        if (newBalance < 0) {
          return NextResponse.json({ error: "Insufficient points for this adjustment" }, { status: 400 });
        }

        const [updatedMember, history] = await db.$transaction([
          db.loyaltyMember.update({
            where: { id: member.id },
            data: {
              availablePoints: newBalance,
              totalPoints: points > 0 ? { increment: points } : undefined,
              earnedMonth: points > 0 ? { increment: points } : undefined,
            },
          }),
          db.pointsHistory.create({
            data: {
              memberId: member.id,
              actionType: body.actionType || (points > 0 ? "Adjusted" : "Deducted"),
              points: points,
              balanceAfter: newBalance,
              description: body.description || `Points ${points > 0 ? "credit" : "debit"} by admin`,
            },
          }),
        ]);

        return NextResponse.json({ success: true, member: updatedMember, history });
      }

      // ── Delete Reward ──
      case "delete_reward": {
        if (!body.rewardId) return NextResponse.json({ error: "Reward ID required" }, { status: 400 });

        const pendingRedemptions = await db.rewardRedemption.count({
          where: { rewardId: body.rewardId, status: "PENDING" },
        });
        if (pendingRedemptions > 0) {
          return NextResponse.json({ error: `Cannot delete: ${pendingRedemptions} pending redemption(s) exist` }, { status: 400 });
        }

        await db.reward.delete({ where: { id: body.rewardId } });
        return NextResponse.json({ success: true, message: "Reward deleted" });
      }

      // ── Create Campaign ──
      case "create_campaign": {
        const { name, description, bonusType, bonusValue, bonusRecipient, maxReferrals, startDate, endDate } = body;
        if (!name) return NextResponse.json({ error: "Campaign name is required" }, { status: 400 });

        const campaign = await db.referralCampaign.create({
          data: {
            name,
            description: description || "",
            bonusType: bonusType || "points",
            bonusValue: Number(bonusValue) || 100,
            bonusRecipient: bonusRecipient || "both",
            maxReferrals: maxReferrals ? Number(maxReferrals) : null,
            startDate: startDate ? new Date(startDate) : new Date(),
            endDate: endDate ? new Date(endDate) : null,
            status: "active",
          },
        });

        await auditLog(req, "CREATE", "ReferralCampaign", campaign.id, { name, bonusType, bonusValue });
        return NextResponse.json({ success: true, campaign });
      }

      // ── Update Campaign ──
      case "update_campaign": {
        const { campaignId, name, description, bonusType, bonusValue, bonusRecipient, maxReferrals, startDate, endDate, status } = body;
        if (!campaignId) return NextResponse.json({ error: "Campaign ID required" }, { status: 400 });

        const existing = await db.referralCampaign.findUnique({ where: { id: campaignId } });
        if (!existing) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

        const campaign = await db.referralCampaign.update({
          where: { id: campaignId },
          data: {
            ...(name ? { name } : {}),
            ...(description !== undefined ? { description } : {}),
            ...(bonusType ? { bonusType } : {}),
            ...(bonusValue !== undefined ? { bonusValue: Number(bonusValue) } : {}),
            ...(bonusRecipient ? { bonusRecipient } : {}),
            ...(maxReferrals !== undefined ? { maxReferrals: maxReferrals ? Number(maxReferrals) : null } : {}),
            ...(startDate ? { startDate: new Date(startDate) } : {}),
            ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
            ...(status ? { status } : {}),
          },
        });

        await auditLog(req, "UPDATE", "ReferralCampaign", campaignId, { details: { name, status }, previousValues: { name: existing.name, status: existing.status } });
        return NextResponse.json({ success: true, campaign });
      }

      // ── Delete Campaign ──
      case "delete_campaign": {
        const { campaignId } = body;
        if (!campaignId) return NextResponse.json({ error: "Campaign ID required" }, { status: 400 });

        await db.referralCampaign.delete({ where: { id: campaignId } });
        await auditLog(req, "DELETE", "ReferralCampaign", campaignId, {});
        return NextResponse.json({ success: true, message: "Campaign deleted" });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Referral API POST error:", error);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}
